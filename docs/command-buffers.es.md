# Búferes de comandos configurables

[en](command-buffers.md) · [fr](command-buffers.fr.md) · [de](command-buffers.de.md) · [es](command-buffers.es.md) · [zh-CN](command-buffers.zh-CN.md)

Los límites de salida capturada se ajustan mediante variables de entorno acotadas. Los desbordamientos indican la familia del comando, ubicación del código y límite, sin argumentos ni salida capturada. Se conservan los valores predeterminados y los comandos en streaming.

## Configuración

Configura estas variables en cada instancia Enhanced que ejecuta comandos. Los helpers heredan los valores validados. Los valores inválidos usan los predeterminados con un aviso, sin registrar el valor recibido. Reinicia/recrea Enhanced tras cambiar su entorno. No cambia los tiempos de espera, límites de registros funcionales ni transferencias en streaming.

| Variable | Predeterminado | Descripción |
| --- | --- | --- |
| `DOCKGE_COMMAND_BUFFER_MULTIPLIER` | `1` | Multiplicador de los límites existentes (entero 1–16); aumentar con precaución: crece la memoria por comando simultáneo. |
| `DOCKGE_COMMAND_BUFFER_MAX_MIB` | `256` | Límite absoluto por comando, en MiB (entero 1–256). |

Valores predeterminados: multiplicador 1 y techo 256 MiB. Límite efectivo = min(límite existente × multiplicador, techo). Los comandos nativos suelen partir de 1 MiB; promisify-child-process de 200 KiB para salida capturada; la inspección de volúmenes usa 4 MiB y conserva pequeños lotes de campos necesarios. Node limita cada flujo; promisify-child-process suma stdout y stderr.

```yaml
environment:
  DOCKGE_COMMAND_BUFFER_MULTIPLIER: "2"
  DOCKGE_COMMAND_BUFFER_MAX_MIB: "256"
```

## Diagnóstico

Un fallo maxBuffer o ENOBUFS genera un registro [commandBuffer] con archivo/línea, familia segura del comando y límites inicial y efectivo en bytes. Este diagnóstico no añade argumentos, valores de entorno, rutas absolutas ni salida capturada. El error original se propaga; otros errores no se reclasifican. Aumentar los límites consume más memoria y no sustituye las consultas acotadas.
