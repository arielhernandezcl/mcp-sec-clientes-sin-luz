# mcp-sec-clientes-sin-luz

Servidor [MCP](https://modelcontextprotocol.io/) que entrega información sobre cortes de suministro eléctrico en Chile a partir de los datos públicos de la [SEC](https://www.sec.cl/) (Superintendencia de Electricidad y Combustibles).

Se ejecuta de forma local y se comunica por **stdio**, por lo que puedes conectarlo a cualquier cliente compatible con MCP —como Claude Desktop o Cursor— sin desplegar nada. Cada consulta se hace directamente desde tu equipo a los servidores de la SEC.

## Herramientas

El servidor expone cuatro herramientas:

| Herramienta | Qué entrega |
| --- | --- |
| `get_cortes_por_fecha` | Clientes afectados por región y comuna para una fecha y hora determinadas. Permite filtrar por región y comuna. |
| `get_clientes_nacional` | Cantidad total de clientes del sistema eléctrico nacional, útil como base para calcular porcentajes. |
| `resumen_cortes` | Resumen agregado de una fecha: total de clientes afectados, comunas y regiones, porcentaje sobre el total nacional, mayor afectación y los principales rankings. |
| `listar_regiones_afectadas` | Regiones con cortes registrados, con su total de clientes y cantidad de comunas. |

Las tres herramientas que consultan por fecha aceptan los parámetros opcionales `anho`, `mes`, `dia` y `hora`. Si no los indicas, se usan la fecha actual de Chile continental y la hora de corte `0`.

## Requisitos

- [Bun](https://bun.sh) 1.1 o superior.

## Instalación

Clona el repositorio e instala las dependencias:

```sh
git clone https://github.com/arielhernandezcl/mcp-sec-clientes-sin-luz.git
cd mcp-sec-clientes-sin-luz
bun install
```

## Ejecución

Inicia el servidor con:

```sh
bun run index.ts
```

El proceso dedica **stdout exclusivamente al protocolo MCP**; los mensajes de estado se escriben en **stderr**.

## Conexión con un cliente MCP

Agrega el servidor a la configuración de tu cliente. La ruta al `index.ts` debe ser **absoluta**, porque la mayoría de los clientes no resuelven rutas relativas:

```json
{
  "mcpServers": {
    "sec-clientes-sin-luz": {
      "command": "bun",
      "args": ["run", "/ruta/absoluta/a/mcp-sec-clientes-sin-luz/index.ts"]
    }
  }
}
```

Reemplaza la ruta por la ubicación real de tu copia. No necesitas configurar un directorio de trabajo: Bun resuelve `node_modules` a partir del propio `index.ts`, así que basta con haber ejecutado `bun install` una vez.

En **Claude Desktop**, ese bloque va dentro de `mcpServers` en `claude_desktop_config.json` (en macOS, `~/Library/Application Support/Claude/`; en Windows, `%APPDATA%\Claude\`). Reinicia la aplicación después de guardarlo. Otros clientes usan su propio formato, pero el contenido es equivalente.

## Ejemplo de respuesta

Al llamar a `resumen_cortes` sin parámetros obtienes un resumen del día en curso. Se muestran solo algunos campos; la respuesta completa incluye además `topRegiones` y `topComunas`:

```json
{
  "fecha": { "anho": 2026, "mes": 10, "dia": 14, "hora": 0 },
  "clientesAfectados": 28558,
  "comunasAfectadas": 182,
  "regionesAfectadas": 15,
  "porcentajeDelTotalNacional": 0.3501,
  "clientesNacionales": 8156814,
  "mayorAfectacion": { "region": "Metropolitana", "comuna": "Pirque", "clientes": 6780 }
}
```

## Fuente de datos

Los datos provienen de los endpoints públicos de la SEC en `https://apps.sec.cl/INTONLINEv1/ClientesAfectados` (`GetPorFecha` y `GetClientesNacional`). No se requiere autenticación ni claves de API. Las respuestas se guardan en una caché en memoria durante 60 segundos para evitar consultas repetidas.

## Estructura

```
.
├── index.ts        # entrypoint del servidor MCP por stdio
├── src/
│   ├── server.ts   # definición del servidor y sus herramientas
│   └── sec.ts      # cliente de la API de la SEC y utilidades
├── package.json
├── tsconfig.json
└── LICENSE
```

## Licencia

Distribuido bajo la licencia [MIT](LICENSE).
