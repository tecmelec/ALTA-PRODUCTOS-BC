import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { findProductsByRef } from '../referenceSearch';
import { ExternalProduct, ItemCategory, Manufacturer, ProductType } from '../types';

interface BulkCreateProps {
  manufacturers: Manufacturer[];
  categories: ItemCategory[];
  units: string[];
  externalProducts: ExternalProduct[];
  apiConfigured: boolean;
  /** Se llama al terminar un alta masiva, para refrescar el listado. */
  onFinished: () => void;
}

// Límite del campo Description en Business Central (igual que en el alta individual).
const MAX_DESCRIPTION_LENGTH = 100;
// Comprobaciones de referencia en paralelo contra el catálogo completo.
const CHECK_CONCURRENCY = 4;
const MAX_ROWS = 500;

type CreateStatus =
  | { kind: 'idle' }
  | { kind: 'creating' }
  | { kind: 'created'; no: string; warning?: string }
  | { kind: 'failed'; message: string };

interface Row {
  id: number;
  manufacturer: string;
  category: string;
  reference: string;
  description: string;
  unit: string;
  create: CreateStatus;
}

type RefCheck =
  | { kind: 'checking' }
  | { kind: 'free' }
  | { kind: 'exists'; codes: string[] }
  | { kind: 'error'; message: string };

type Field = 'manufacturer' | 'category' | 'reference' | 'description' | 'unit';
const FIELDS: Field[] = ['manufacturer', 'category', 'reference', 'description', 'unit'];

const COLUMN_LABELS: Record<Field, string> = {
  manufacturer: 'Fabricante',
  category: 'Categoría',
  reference: 'Referencia',
  description: 'Descripción',
  unit: 'U.M. base',
};

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const normalizeHeader = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '');

/** Reconoce la columna a partir del texto de una cabecera copiada de Excel. */
function headerToField(header: string): Field | null {
  const h = normalizeHeader(header);
  if (!h) return null;
  if (h.startsWith('fabric')) return 'manufacturer';
  if (h.startsWith('categ')) return 'category';
  if (h.startsWith('ref')) return 'reference';
  if (h.startsWith('descrip')) return 'description';
  if (h.startsWith('unidad') || h === 'um' || h === 'umbase' || h.startsWith('medida')) return 'unit';
  return null;
}

/**
 * Convierte el texto que pega Excel (columnas separadas por tabuladores y
 * filas por saltos de línea) en una matriz. Respeta las celdas entre
 * comillas, que es como Excel copia las que contienen saltos de línea,
 * tabuladores o comillas.
 */
function parseClipboardTable(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;
  const src = text.replace(/\r\n?/g, '\n');

  while (i < src.length) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cell += ch;
      i++;
      continue;
    }
    if (ch === '"' && cell === '') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === '\t') {
      row.push(cell);
      cell = '';
      i++;
      continue;
    }
    if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
      continue;
    }
    cell += ch;
    i++;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const clean = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim().toUpperCase();

/**
 * Descripción final que se envía a BC: descripción + " REF. <ref>", con
 * el mismo recorte que el alta individual (se recorta la descripción por
 * la última palabra completa, nunca la referencia).
 */
function buildFinalDescription(description: string, reference: string): string {
  const refSuffix = ` REF. ${reference}`;
  const maxDescLen = MAX_DESCRIPTION_LENGTH - refSuffix.length;
  let desc = description;
  if (desc.length > maxDescLen) {
    desc = desc.slice(0, Math.max(0, maxDescLen));
    const lastSpace = desc.lastIndexOf(' ');
    if (lastSpace > 0) desc = desc.slice(0, lastSpace);
    desc = desc.trim();
  }
  return desc.endsWith(refSuffix.trim()) ? desc : `${desc}${refSuffix}`;
}

let nextRowId = 1;
const newRow = (values: Partial<Record<Field, string>>): Row => ({
  id: nextRowId++,
  manufacturer: clean(values.manufacturer),
  category: clean(values.category),
  reference: clean(values.reference),
  description: clean(values.description),
  unit: clean(values.unit),
  create: { kind: 'idle' },
});

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

const BulkCreate: React.FC<BulkCreateProps> = ({
  manufacturers,
  categories,
  units,
  externalProducts,
  apiConfigured,
  onFinished,
}) => {
  const [rows, setRows] = useState<Row[]>([]);
  const [refChecks, setRefChecks] = useState<Record<string, RefCheck>>({});
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [notice, setNotice] = useState<string | null>(null);
  const runningRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const inFlightRef = useRef(new Set<string>());

  // --- Catálogos para validar -------------------------------------------------

  const manufacturerIndex = useMemo(() => {
    const byCode = new Map<string, string>();
    const byName = new Map<string, string>();
    for (const m of manufacturers) {
      byCode.set(m.code.toUpperCase(), m.code);
      if (m.name) byName.set(m.name.trim().toUpperCase(), m.code);
    }
    return { byCode, byName };
  }, [manufacturers]);

  const categoryIndex = useMemo(() => {
    const byCode = new Map<string, string>();
    const byName = new Map<string, string>();
    for (const c of categories) {
      byCode.set(c.code.toUpperCase(), c.code);
      if (c.description) byName.set(c.description.trim().toUpperCase(), c.code);
    }
    return { byCode, byName };
  }, [categories]);

  const unitIndex = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of units) map.set(u.toUpperCase(), u);
    return map;
  }, [units]);

  // --- Pegar desde Excel -----------------------------------------------------

  const addFromClipboard = useCallback((text: string) => {
    const table = parseClipboardTable(text);
    if (table.length === 0) return;

    // Si la primera fila es una cabecera reconocible, la usamos para saber
    // qué columna es cada una; si no, se asume el orden de la tabla.
    let mapping: (Field | null)[] = FIELDS;
    let dataRows = table;
    const headerMapping = table[0].map(headerToField);
    if (headerMapping.filter(Boolean).length >= 2) {
      mapping = headerMapping;
      dataRows = table.slice(1);
    }

    const parsed = dataRows.map((cells) => {
      const values: Partial<Record<Field, string>> = {};
      mapping.forEach((field, idx) => {
        if (field) values[field] = cells[idx];
      });
      return newRow(values);
    });

    const room = Math.max(0, MAX_ROWS - rows.length);
    setNotice(
      parsed.length > room
        ? `Solo se admiten ${MAX_ROWS} filas por alta masiva; se han descartado ${parsed.length - room}.`
        : null,
    );
    setRows((prev) => [...prev, ...parsed.slice(0, room)]);
  }, [rows.length]);

  const handlePasteZone = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    addFromClipboard(e.clipboardData.getData('text'));
  };

  /** Pegar varias celdas sobre una celda de la tabla también añade filas. */
  const handleCellPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (/[\t\n]/.test(text.trim())) {
      e.preventDefault();
      addFromClipboard(text);
    }
  };

  const updateCell = (id: number, field: Field, value: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value.toUpperCase() } : r)));
  };

  const removeRow = (id: number) => setRows((prev) => prev.filter((r) => r.id !== id));

  const clearTable = () => {
    setRows([]);
    setNotice(null);
  };

  const removeCreated = () => setRows((prev) => prev.filter((r) => r.create.kind !== 'created'));

  // --- Comprobación de referencias existentes (catálogo completo) ------------

  const pendingRefs = useMemo(() => {
    const refs = new Set<string>();
    for (const r of rows) {
      const ref = r.reference.trim();
      if (ref && r.create.kind !== 'created' && !refChecks[ref]) refs.add(ref);
    }
    return [...refs];
  }, [rows, refChecks]);

  useEffect(() => {
    if (!apiConfigured || pendingRefs.length === 0) return;
    // Pequeña espera para no lanzar una consulta por cada tecla al editar.
    const timeout = setTimeout(() => {
      const queue = pendingRefs.filter((ref) => !inFlightRef.current.has(ref));
      if (queue.length === 0) return;
      queue.forEach((ref) => inFlightRef.current.add(ref));
      setRefChecks((prev) => {
        const next = { ...prev };
        queue.forEach((ref) => (next[ref] = { kind: 'checking' }));
        return next;
      });

      const worker = async () => {
        while (queue.length > 0) {
          const ref = queue.shift()!;
          let result: RefCheck;
          try {
            const matches = await findProductsByRef(ref, { apiConfigured, externalProducts });
            const codes = matches.map((m) => m.no);
            result = codes.length > 0 ? { kind: 'exists', codes } : { kind: 'free' };
          } catch (err: any) {
            result = { kind: 'error', message: err?.message ?? 'Error al comprobar' };
          }
          inFlightRef.current.delete(ref);
          setRefChecks((prev) => ({ ...prev, [ref]: result }));
        }
      };
      for (let i = 0; i < CHECK_CONCURRENCY; i++) void worker();
    }, 500);
    return () => clearTimeout(timeout);
  }, [pendingRefs, apiConfigured, externalProducts]);

  const recheckRef = (ref: string) => {
    setRefChecks((prev) => {
      const next = { ...prev };
      delete next[ref];
      return next;
    });
  };

  // --- Validación por fila ----------------------------------------------------

  interface Validation {
    errors: string[];
    notes: string[];
    pending: boolean;
    existingCodes: string[];
    resolved?: { manufacturerCode: string; categoryCode: string; unit: string };
    finalDescription?: string;
  }

  const validations = useMemo(() => {
    const firstRowByRef = new Map<string, number>();
    rows.forEach((r, idx) => {
      const ref = r.reference.trim();
      if (ref && !firstRowByRef.has(ref)) firstRowByRef.set(ref, idx);
    });

    const result = new Map<number, Validation>();
    rows.forEach((r, idx) => {
      const errors: string[] = [];
      const notes: string[] = [];
      let pending = false;
      let existingCodes: string[] = [];

      const manufacturerCode = r.manufacturer
        ? manufacturerIndex.byCode.get(r.manufacturer) ?? manufacturerIndex.byName.get(r.manufacturer)
        : undefined;
      const categoryCode = r.category
        ? categoryIndex.byCode.get(r.category) ?? categoryIndex.byName.get(r.category)
        : undefined;
      const unit = r.unit ? unitIndex.get(r.unit) : undefined;

      if (!r.manufacturer) errors.push('Falta el fabricante');
      else if (!manufacturerCode) errors.push(`El fabricante ${r.manufacturer} no existe`);

      if (!r.category) errors.push('Falta la categoría');
      else if (!categoryCode) errors.push(`La categoría ${r.category} no existe`);

      if (!r.unit) errors.push('Falta la unidad de medida');
      else if (!unit) errors.push(`La unidad ${r.unit} no existe`);

      const ref = r.reference.trim();
      if (!ref) {
        errors.push('Falta la referencia');
      } else {
        const first = firstRowByRef.get(ref)!;
        if (first !== idx) errors.push(`Referencia repetida en la fila ${first + 1}`);
        const check = refChecks[ref];
        if (!check || check.kind === 'checking') pending = true;
        else if (check.kind === 'exists') {
          existingCodes = check.codes;
          errors.push(`La referencia ya existe en ${check.codes.join(', ')}`);
        } else if (check.kind === 'error') {
          errors.push(`No se pudo comprobar la referencia: ${check.message}`);
        }
      }

      if (!r.description.trim()) errors.push('Falta la descripción');

      let finalDescription: string | undefined;
      if (ref && r.description.trim()) {
        finalDescription = buildFinalDescription(r.description.trim(), ref);
        const kept = finalDescription.length - ` REF. ${ref}`.length;
        if (kept < r.description.trim().length) {
          notes.push(`La descripción se recortará a ${kept} caracteres para que quepa la referencia`);
        }
        if (kept < 10) errors.push('La referencia es tan larga que no deja sitio a la descripción');
      }

      result.set(r.id, {
        errors,
        notes,
        pending,
        existingCodes,
        resolved:
          manufacturerCode && categoryCode && unit
            ? { manufacturerCode, categoryCode, unit }
            : undefined,
        finalDescription,
      });
    });
    return result;
  }, [rows, refChecks, manufacturerIndex, categoryIndex, unitIndex]);

  const counts = useMemo(() => {
    let ready = 0;
    let withErrors = 0;
    let existing = 0;
    let pending = 0;
    let created = 0;
    let failed = 0;
    for (const r of rows) {
      if (r.create.kind === 'created') {
        created++;
        continue;
      }
      if (r.create.kind === 'failed') failed++;
      const v = validations.get(r.id)!;
      if (v.existingCodes.length > 0) existing++;
      if (v.errors.length > 0) withErrors++;
      else if (v.pending) pending++;
      else ready++;
    }
    return { ready, withErrors, existing, pending, created, failed };
  }, [rows, validations]);

  // --- Alta en Business Central ----------------------------------------------

  const handleCreateAll = async () => {
    if (runningRef.current) return;

    const toCreate = rows.filter((r) => {
      if (r.create.kind === 'created') return false;
      const v = validations.get(r.id)!;
      return v.errors.length === 0 && !v.pending && v.resolved && v.finalDescription;
    });
    if (toCreate.length === 0) return;

    const skipped = rows.filter((r) => r.create.kind !== 'created').length - toCreate.length;
    const message =
      `Se van a dar de alta ${toCreate.length} productos en Business Central.` +
      (skipped > 0 ? `\n\n${skipped} filas con errores no se darán de alta.` : '') +
      '\n\n¿Continuar?';
    if (!window.confirm(message)) return;

    runningRef.current = true;
    stopRequestedRef.current = false;
    setIsRunning(true);
    setProgress({ done: 0, total: toCreate.length });

    const setStatus = (id: number, create: CreateStatus) =>
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, create } : r)));

    // Se dan de alta de uno en uno y en orden: así cada producto calcula su
    // código con el anterior ya creado en BC y no se pisan los correlativos.
    let done = 0;
    for (const row of toCreate) {
      if (stopRequestedRef.current) break;
      const v = validations.get(row.id)!;
      setStatus(row.id, { kind: 'creating' });
      try {
        const created = await api.createProduct({
          type: ProductType.FABRICANTE,
          description: v.finalDescription!,
          manufacturerCode: v.resolved!.manufacturerCode,
          itemCategoryCode: v.resolved!.categoryCode,
          baseUnitOfMeasure: v.resolved!.unit,
          unitPrice: 0,
          unitCost: 0,
          inventoryPostingGroup: 'MERCADERÍA',
          genProdPostingGroup: 'MERCADERÍA',
          vatProdPostingGroup: 'IVA21',
        });
        setStatus(row.id, { kind: 'created', no: created.no, warning: created.dimensionWarning });
      } catch (err: any) {
        setStatus(row.id, { kind: 'failed', message: err?.message ?? 'Error desconocido' });
        // Por si el alta llegó a hacerse en BC pese al error, volvemos a
        // comprobar la referencia antes de permitir reintentarla.
        recheckRef(row.reference.trim());
      }
      done++;
      setProgress({ done, total: toCreate.length });
    }

    runningRef.current = false;
    setIsRunning(false);
    onFinished();
  };

  const requestStop = () => {
    stopRequestedRef.current = true;
  };

  // --- Render ----------------------------------------------------------------

  if (!apiConfigured) {
    return (
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 text-sm text-gray-600">
        El alta masiva necesita la conexión con Business Central. Configura <code>VITE_API_BASE_URL</code> para usarla.
      </div>
    );
  }

  const remaining = rows.filter((r) => r.create.kind !== 'created').length;
  const canCreate = !isRunning && counts.ready > 0 && counts.pending === 0;

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h2 className="text-xl font-bold text-gray-800 mb-1">Alta masiva</h2>
        <p className="text-sm text-gray-500 mb-4">
          Copia en Excel las columnas Fabricante, Categoría, Referencia, Descripción y Unidad de medida base, y pégalas aquí.
          Si copias también la fila de títulos, se usará para colocar cada columna.
        </p>
        <textarea
          onPaste={handlePasteZone}
          disabled={isRunning}
          value=""
          onChange={() => undefined}
          placeholder="Haz clic aquí y pega (Ctrl+V) las filas copiadas de Excel"
          rows={3}
          className="w-full p-4 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none resize-none disabled:opacity-50"
        />
        {notice && <p className="mt-2 text-sm text-amber-700">{notice}</p>}
      </div>

      {rows.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 px-6 py-4 border-b border-gray-100">
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <span className="text-gray-700"><b>{rows.length}</b> filas</span>
              <span className="text-green-700"><b>{counts.ready}</b> listas</span>
              {counts.pending > 0 && <span className="text-gray-500"><b>{counts.pending}</b> comprobando referencia…</span>}
              {counts.withErrors > 0 && <span className="text-red-600"><b>{counts.withErrors}</b> con errores</span>}
              {counts.existing > 0 && <span className="text-amber-700"><b>{counts.existing}</b> ya existen</span>}
              {counts.created > 0 && <span className="text-blue-700"><b>{counts.created}</b> dadas de alta</span>}
            </div>
            <div className="flex items-center gap-3">
              {isRunning ? (
                <>
                  <span className="text-sm text-gray-600">
                    Dando de alta {progress.done} de {progress.total}…
                  </span>
                  <button
                    onClick={requestStop}
                    className="px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50"
                  >
                    Detener
                  </button>
                </>
              ) : (
                <>
                  {counts.created > 0 && (
                    <button onClick={removeCreated} className="text-sm text-gray-500 hover:text-gray-700 underline">
                      Quitar las dadas de alta
                    </button>
                  )}
                  <button onClick={clearTable} className="text-sm text-gray-500 hover:text-gray-700 underline">
                    Vaciar tabla
                  </button>
                  <button
                    onClick={handleCreateAll}
                    disabled={!canCreate}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-bold shadow-lg shadow-blue-200 disabled:bg-gray-300 disabled:shadow-none disabled:cursor-not-allowed"
                    title={counts.pending > 0 ? 'Espera a que termine la comprobación de referencias' : undefined}
                  >
                    Dar de alta {counts.ready > 0 ? `${counts.ready} productos` : 'productos'}
                  </button>
                </>
              )}
            </div>
          </div>

          {isRunning && (
            <div className="h-1 bg-gray-100">
              <div
                className="h-1 bg-blue-600 transition-all"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-3 py-3 text-xs font-bold text-gray-400 w-10">#</th>
                  {FIELDS.map((f) => (
                    <th key={f} className="px-2 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">
                      {COLUMN_LABELS[f]}
                    </th>
                  ))}
                  <th className="px-3 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider min-w-[220px]">Código asignado</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r, idx) => {
                  const v = validations.get(r.id)!;
                  const locked = isRunning || r.create.kind === 'created' || r.create.kind === 'creating';
                  const ref = r.reference.trim();
                  const fieldError: Record<Field, boolean> = {
                    manufacturer: !r.manufacturer || !(manufacturerIndex.byCode.has(r.manufacturer) || manufacturerIndex.byName.has(r.manufacturer)),
                    category: !r.category || !(categoryIndex.byCode.has(r.category) || categoryIndex.byName.has(r.category)),
                    unit: !r.unit || !unitIndex.has(r.unit),
                    reference: !ref || v.errors.some((e) => e.startsWith('Referencia repetida') || e.startsWith('La referencia')),
                    description: !r.description.trim(),
                  };

                  return (
                    <tr key={r.id} className={r.create.kind === 'created' ? 'bg-blue-50/40' : undefined}>
                      <td className="px-3 py-2 text-xs text-gray-400 align-top pt-4">{idx + 1}</td>
                      {FIELDS.map((f) => (
                        <td key={f} className={`px-2 py-2 align-top ${f === 'description' ? 'min-w-[320px]' : 'min-w-[110px]'}`}>
                          <input
                            type="text"
                            value={r[f]}
                            disabled={locked}
                            onChange={(e) => updateCell(r.id, f, e.target.value)}
                            onPaste={handleCellPaste}
                            aria-label={`${COLUMN_LABELS[f]}, fila ${idx + 1}`}
                            className={`w-full px-2 py-1.5 rounded border text-sm uppercase outline-none focus:ring-2 disabled:bg-transparent disabled:border-transparent ${
                              !locked && fieldError[f]
                                ? 'border-red-300 bg-red-50 focus:ring-red-200'
                                : 'border-gray-200 focus:ring-blue-200'
                            } ${f === 'reference' ? 'font-mono' : ''}`}
                          />
                        </td>
                      ))}
                      <td className="px-3 py-2 align-top pt-3 text-sm">
                        <RowResult row={r} validation={v} onRecheck={() => recheckRef(ref)} />
                      </td>
                      <td className="px-2 py-2 align-top pt-3">
                        {!locked && (
                          <button
                            onClick={() => removeRow(r.id)}
                            className="text-gray-300 hover:text-red-500 text-lg leading-none"
                            title="Quitar fila"
                            aria-label={`Quitar fila ${idx + 1}`}
                          >
                            ×
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!isRunning && remaining > 0 && counts.withErrors > 0 && (
            <p className="px-6 py-3 text-xs text-gray-500 border-t border-gray-100">
              Las filas con errores no se darán de alta. Corrígelas en la propia tabla o quítalas.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

const RowResult: React.FC<{
  row: Row;
  validation: {
    errors: string[];
    notes: string[];
    pending: boolean;
  };
  onRecheck: () => void;
}> = ({ row, validation, onRecheck }) => {
  switch (row.create.kind) {
    case 'creating':
      return <span className="text-gray-500">Creando…</span>;
    case 'created':
      return (
        <div>
          <span className="font-mono font-bold text-blue-700">{row.create.no}</span>
          {row.create.warning && <p className="text-xs text-amber-700 mt-1">{row.create.warning}</p>}
        </div>
      );
    default:
      break;
  }

  const failed = row.create.kind === 'failed' ? row.create.message : null;

  if (validation.errors.length > 0) {
    const checkError = validation.errors.find((e) => e.startsWith('No se pudo comprobar'));
    return (
      <div className="space-y-0.5">
        {failed && <p className="text-xs text-red-700 font-bold">Error al dar de alta: {failed}</p>}
        {validation.errors.map((e) => (
          <p key={e} className={`text-xs ${e.startsWith('La referencia ya existe') ? 'text-amber-700 font-bold' : 'text-red-600'}`}>
            {e}
          </p>
        ))}
        {checkError && (
          <button onClick={onRecheck} className="text-xs text-blue-600 underline">
            Volver a comprobar
          </button>
        )}
      </div>
    );
  }

  if (validation.pending) return <span className="text-xs text-gray-400">Comprobando referencia…</span>;

  return (
    <div className="space-y-0.5">
      {failed ? (
        <p className="text-xs text-red-700 font-bold">Error al dar de alta: {failed}. Se reintentará al volver a pulsar el botón.</p>
      ) : (
        <p className="text-xs text-green-700 font-bold">Lista</p>
      )}
      {validation.notes.map((n) => (
        <p key={n} className="text-xs text-gray-500">{n}</p>
      ))}
    </div>
  );
};

export default BulkCreate;
