import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer } from './src/server.ts'

const server = createServer()
const transport = new StdioServerTransport()

await server.connect(transport)

console.error(
  '[mcp-sec-local] servidor local listo; herramientas: get_cortes_por_fecha, get_clientes_nacional, resumen_cortes, listar_regiones_afectadas',
)
