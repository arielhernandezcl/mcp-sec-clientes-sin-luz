const BASE_URL = 'https://apps.sec.cl/INTONLINEv1/ClientesAfectados'

type Corte = { region: string; comuna: string; clientes: number }
type Fecha = { anho: number; mes: number; dia: number; hora: number }
type ResumenRegion = { region: string; clientes: number; comunas: number }
type ResumenCortes = {
  clientesAfectados: number
  comunasAfectadas: number
  regionesAfectadas: number
  porcentajeDelTotalNacional: number | null
  clientesNacionales: number | null
  mayorAfectacion: Corte | null
  topRegiones: ResumenRegion[]
  topComunas: Corte[]
}

const HEADERS: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  Accept: 'application/json, text/javascript, */*; q=0.01',
  'X-Requested-With': 'XMLHttpRequest',
  Referer: 'https://apps.sec.cl/INTONLINEv1/index.aspx',
  Origin: 'https://apps.sec.cl',
  'User-Agent': 'mcp-sec/1.0 (https://www.sec.cl/interrupciones-en-linea/)',
}

const CACHE_TTL_MS = 60_000
const cache = new Map<string, { at: number; value: unknown }>()

function getCached<T>(key: string): T | undefined {
  const hit = cache.get(key)
  if (!hit) return undefined
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key)
    return undefined
  }
  return hit.value as T
}

function setCached<T>(key: string, value: T): T {
  cache.set(key, { at: Date.now(), value })
  return value
}

export function clearCache() {
  cache.clear()
}

async function post(
  path: string,
  bodyText: string,
  { timeoutMs = 20_000 }: { timeoutMs?: number } = {},
): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: HEADERS,
      body: bodyText,
      signal: controller.signal,
    })
    if (!response.ok) {
      if (response.status === 522) {
        const error = new Error('No disponible en este momento.') as Error & { code: string }
        error.code = 'SEC_TEMPORARILY_UNAVAILABLE'
        throw error
      }
      if (response.status >= 500) {
        throw new Error(
          `El servicio de la SEC presenta un problema temporal (HTTP ${response.status}). Intenta nuevamente más tarde.`,
        )
      }
      throw new Error(`El servicio SEC respondió HTTP ${response.status}.`)
    }
    const payload = await response.json()
    return payload
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Tiempo de espera agotado al consultar ${path} (${timeoutMs} ms)`)
    }
    const errorCode =
      error instanceof Error && 'code' in error ? error.code : undefined
    const causeCode =
      error instanceof Error && error.cause && typeof error.cause === 'object' && 'code' in error.cause
        ? error.cause.code
        : undefined
    if (causeCode === 'ECONNREFUSED' || errorCode === 'ECONNREFUSED') {
      throw new Error(
        `No se pudo conectar con apps.sec.cl (${path}). El servicio puede estar caído o bloqueando la conexión.`,
      )
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

/** Normaliza la respuesta cruda a `{ region, comuna, clientes }`. */
export function normalize(rows: Array<Record<string, unknown>>): Corte[] {
  return rows
    .map((row) => ({
      region: String(row?.NOMBRE_REGION ?? '').trim(),
      comuna: String(row?.NOMBRE_COMUNA ?? '').trim(),
      clientes: Number(row?.CLIENTES_AFECTADOS) || 0,
    }))
    .filter((row) => row.region && row.comuna && row.clientes > 0)
}

/** Clientes afectados por comuna para una fecha/hora dadas. */
export async function fetchPorFecha({ anho, mes, dia, hora = 0 }: Fecha): Promise<Corte[]> {
  const key = `fecha:${anho}-${mes}-${dia}-${hora}`
  const cached = getCached<Corte[]>(key)
  if (cached) return cached
  const payload = await post('/GetPorFecha', JSON.stringify({ anho, mes, dia, hora }))
  if (!Array.isArray(payload)) {
    throw new Error('GetPorFecha devolvió un formato inesperado (se esperaba un arreglo).')
  }
  return setCached(key, normalize(payload))
}

/** Total de clientes a nivel nacional (base del sistema). */
export async function fetchClientesNacional(): Promise<number> {
  const key = 'nacional'
  const cached = getCached<number>(key)
  if (cached) return cached
  const payload = await post('/GetClientesNacional', '')
  const clientes = Number(
    Array.isArray(payload) ? (payload[0] as Record<string, unknown> | undefined)?.CLIENTES : undefined,
  )
  if (!Number.isFinite(clientes)) {
    throw new Error('GetClientesNacional devolvió un formato inesperado.')
  }
  return setCached(key, clientes)
}

/** Fecha actual en la zona horaria de Chile continental. */
export function hoySantiago(now = new Date()): Omit<Fecha, 'hora'> {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  const [anho, mes, dia] = parts.split('-').map(Number)
  return { anho, mes, dia }
}

export function agregarPorRegion(records: Corte[]): ResumenRegion[] {
  const map = new Map()
  for (const row of records) {
    const current = map.get(row.region) ?? { region: row.region, clientes: 0, comunas: 0 }
    current.clientes += row.clientes
    current.comunas += 1
    map.set(row.region, current)
  }
  return [...map.values()].sort((a, b) => b.clientes - a.clientes)
}

export function resumir(records: Corte[], nacional: number | null): ResumenCortes {
  const porRegion = agregarPorRegion(records)
  const ordenadas = [...records].sort((a, b) => b.clientes - a.clientes)
  const total = records.reduce((sum, row) => sum + row.clientes, 0)
  return {
    clientesAfectados: total,
    comunasAfectadas: records.length,
    regionesAfectadas: porRegion.length,
    porcentajeDelTotalNacional: nacional ? Number(((total / nacional) * 100).toFixed(4)) : null,
    clientesNacionales: nacional ?? null,
    mayorAfectacion: ordenadas[0] ?? null,
    topRegiones: porRegion.slice(0, 5),
    topComunas: ordenadas.slice(0, 5),
  }
}
