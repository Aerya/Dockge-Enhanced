# Instancias vinculadas detrás de SSO

[English](sso-federation.md) · [Français](sso-federation.fr.md) · [Deutsch](sso-federation.de.md) · [Español](sso-federation.es.md) · [简体中文](sso-federation.zh-CN.md)

Las conexiones unidireccionales opcionales permiten gestionar un servidor remoto sin conexión de retorno ni propagación en la malla. Utilice un token de federación Enhanced y, si hace falta, credenciales HTTP Basic separadas para el proxy mediante HTTPS/WebSocket. Authentik requiere una cuenta autorizada (existente o preferiblemente dedicada), una contraseña de aplicación y autenticación por cabeceras; Enhanced no configura el proxy. El SSO público permanece activo. Configure la conexión por separado en cada instancia local.

## Configuración
1. Actualice ambas instancias Enhanced. En la remota, inicie sesión por SSO como administrador. En Inicio, elija **Crear token de federación** y cópielo de forma privada.
2. En la administración del proxy/SSO, utilice su cuenta existente o, preferiblemente, una cuenta dedicada autorizada para la aplicación y genere una contraseña de aplicación para esa cuenta (no su contraseña SSO habitual). En Authentik, active **Intercept header authentication** en el proveedor proxy y asegúrese de transmitir la cabecera Authorization al outpost. Enhanced no cambia la configuración del proxy.
3. En la instancia local, elija **Añadir Agente**, introduzca el origen HTTPS remoto sin ruta, seleccione **Token de federación** y pegue el token Enhanced.
4. Active **Conectar solo desde esta instancia**. Introduzca el nombre de usuario Authentik de la cuenta elegida y su contraseña de aplicación en los campos HTTP Basic separados y conecte. Déjelos vacíos si no necesita autenticación del proxy.
5. Repita en cada instancia local deseada. No se necesita conexión de retorno desde el servidor remoto a su LAN privada.

## Seguridad y funcionamiento
Las credenciales del proxy solo permiten atravesarlo; el token Enhanced sigue siendo obligatorio en modo trusted-proxy. Una cabecera endpoint no autentica al agente. El SSO del navegador no cambia. La validación de certificados HTTPS permanece activa; se usa WebSocket sin seguir redirecciones. El proxy debe admitir WebSocket. No es compatibilidad automática con todos los proveedores SSO.

Utilice cuentas administrativas dedicadas y de confianza: los tokens de federación permiten acciones administrativas. Se mantiene el mecanismo existente: desactivar/eliminar la cuenta emisora invalida sus tokens; cambiar la contraseña no basta. No hay interfaz de revocación individual. Eliminar el vínculo local detiene su conexión; si se filtra el token, revoque la cuenta emisora.

Las credenciales del proxy se guardan en la base local de Enhanced como las credenciales de agentes existentes. Proteja los datos y sus copias. No se devuelven en la lista de agentes ni se propagan por la malla. Los vínculos unidireccionales sobreviven a la sincronización y no pueden sobrescribirse desde ella. Al reautenticar, completar ambos campos del proxy reemplaza sus credenciales; dejarlos vacíos elimina esta autenticación. Para cambiar de dirección, elimine y vuelva a añadir el vínculo.

El vínculo pertenece solo a la instancia local que lo creó. El servidor remoto no obtiene acceso administrativo a ella. La malla completa existente no cambia. No se crea una VPN ni se hacen accesibles direcciones privadas; las transferencias y funciones que requieren rutas directas/de retorno mantienen sus requisitos de red.

[Authentik — Header authentication](https://docs.goauthentik.io/add-secure-apps/providers/proxy/header_authentication/)

