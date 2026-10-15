import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  fetchPorFecha,
  fetchClientesNacional,
  hoySantiago,
  agregarPorRegion,
  resumir,
} from './sec.ts'

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'sec-clientes-sin-luz',
    version: '1.0.0',
  })

  const fechaSchema = {
    anho: z.number().int().min(2000).max(2100).optional().describe('Año de la consulta. Por defecto, el año actual en Chile.'),
    mes: z.number().int().min(1).max(12).optional().describe('Mes (1-12). Por defecto, el mes actual en Chile.'),
    dia: z.number().int().min(1).max(31).optional().describe('Día del mes (1-31). Por defecto, el día actual en Chile.'),
    hora: z.number().int().min(0).max(23).optional().describe('Hora de corte de la consulta (0-23). Por defecto 0.'),
  }

  function resolverFecha({ anho, mes, dia, hora }: {
    anho?: number
    mes?: number
    dia?: number
    hora?: number
  }) {
    const hoy = hoySantiago()
    return {
      anho: anho ?? hoy.anho,
      mes: mes ?? hoy.mes,
      dia: dia ?? hoy.dia,
      hora: hora ?? 0,
    }
  }

  function texto(data: unknown) {
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
  }

  function errorTexto(error: unknown) {
    const errorCode =
      error instanceof Error && 'code' in error ? error.code : undefined
    const message = error instanceof Error ? error.message : String(error)
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text:
            errorCode === 'SEC_TEMPORARILY_UNAVAILABLE'
              ? message
              : `Error consultando la SEC: ${message}`,
        },
      ],
    }
  }

  server.registerTool(
    'get_cortes_por_fecha',
    {
      title: 'Cortes por fecha',
      description:
        'Devuelve los clientes afectados por cortes de suministro eléctrico, agrupados por región y comuna, para un día y hora determinados. Permite filtrar por región y comuna.',
      inputSchema: {
        ...fechaSchema,
        region: z.string().optional().describe('Filtra por nombre de región (coincidencia parcial, sin distinguir mayúsculas ni tildes de formato).'),
        comuna: z.string().optional().describe('Filtra por nombre de comuna (coincidencia parcial).'),
        limite: z.number().int().min(1).max(500).optional().describe('Máximo de filas a devolver (por defecto 200).'),
      },
    },
    async ({ anho, mes, dia, hora, region, comuna, limite }) => {
      try {
        const fecha = resolverFecha({ anho, mes, dia, hora })
        const registros = await fetchPorFecha(fecha)
        const normalizarTexto = (valor: string) =>
          String(valor).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')
        const filtroRegion = region ? normalizarTexto(region) : null
        const filtroComuna = comuna ? normalizarTexto(comuna) : null
        const filtrados = registros
          .filter((row) => !filtroRegion || normalizarTexto(row.region).includes(filtroRegion))
          .filter((row) => !filtroComuna || normalizarTexto(row.comuna).includes(filtroComuna))
          .sort((a, b) => b.clientes - a.clientes)
        const max = limite ?? 200
        return texto({
          fecha,
          totalRegistros: filtrados.length,
          clientesAfectados: filtrados.reduce((sum, row) => sum + row.clientes, 0),
          mostrando: Math.min(filtrados.length, max),
          registros: filtrados.slice(0, max),
        })
      } catch (error) {
        return errorTexto(error)
      }
    },
  )

  server.registerTool(
    'get_clientes_nacional',
    {
      title: 'Clientes nacionales',
      description:
        'Devuelve el total de clientes del sistema eléctrico nacional según la SEC. Sirve como base para calcular el porcentaje de clientes afectados.',
      inputSchema: {},
    },
    async () => {
      try {
        const clientes = await fetchClientesNacional()
        return texto({ clientesNacionales: clientes, fuente: 'SEC · GetClientesNacional' })
      } catch (error) {
        return errorTexto(error)
      }
    },
  )

  server.registerTool(
    'resumen_cortes',
    {
      title: 'Resumen nacional de cortes',
      description:
        'Entrega un resumen agregado para una fecha: clientes afectados, comunas y regiones afectadas, porcentaje sobre la base nacional, mayor afectación y los principales rankings de regiones y comunas.',
      inputSchema: fechaSchema,
    },
    async ({ anho, mes, dia, hora }) => {
      try {
        const fecha = resolverFecha({ anho, mes, dia, hora })
        const registros = await fetchPorFecha(fecha)
        let nacional = null
        try {
          nacional = await fetchClientesNacional()
        } catch {
          nacional = null
        }
        return texto({ fecha, ...resumir(registros, nacional) })
      } catch (error) {
        return errorTexto(error)
      }
    },
  )

  server.registerTool(
    'listar_regiones_afectadas',
    {
      title: 'Regiones afectadas',
      description:
        'Lista las regiones con cortes registrados para una fecha, con su total de clientes afectados y cantidad de comunas. Útil para conocer qué zonas están disponibles antes de filtrar.',
      inputSchema: fechaSchema,
    },
    async ({ anho, mes, dia, hora }) => {
      try {
        const fecha = resolverFecha({ anho, mes, dia, hora })
        const registros = await fetchPorFecha(fecha)
        const regiones = agregarPorRegion(registros)
        return texto({
          fecha,
          totalRegiones: regiones.length,
          regiones,
        })
      } catch (error) {
        return errorTexto(error)
      }
    },
  )

  return server
}
