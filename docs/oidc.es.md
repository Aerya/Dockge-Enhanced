# Inicio de sesión con OpenID Connect (OIDC)

[English](oidc.md) · [Français](oidc.fr.md) · [Español](oidc.es.md) · [Deutsch](oidc.de.md) · [简体中文](oidc.zh-CN.md)

Dockge-Enhanced puede iniciar la sesión de los usuarios directamente con un proveedor OpenID Connect como Pocket ID, Authentik, Keycloak, Authelia o Google, sin proxy inverso delante. OIDC funciona **junto con** las cuentas locales, la 2FA y las cuentas limitadas, en el modo de autenticación `local` (el predeterminado). Se ignora cuando `DOCKGE_AUTH_MODE` es `disabled` o `trusted-proxy`.

Dockge usa el flujo Authorization Code con PKCE (S256), `state` y `nonce`. Valida el token de identidad (firma, emisor, audiencia, caducidad, nonce). Tras un inicio de sesión correcto, Dockge abre la misma sesión que con contraseña, de modo que las API HTTP, la revocación, el registro de auditoría y las cuentas limitadas se comportan exactamente igual.

## Configuración del proveedor

Crea un cliente (aplicación) OIDC en tu proveedor:

- **URI de redirección / URL de callback**: `https://dockge.example.com/api/auth/oidc/callback`
- **Tipo de cliente**: confidencial (con secreto de cliente) o público (solo PKCE). Ambos funcionan.
- **Scopes**: `openid profile email`. Añade `groups` si usas `DOCKGE_OIDC_ADMIN_GROUPS` y tu proveedor lo necesita (Pocket ID, Authentik).

## Configuración

| Variable | Predeterminado | Descripción |
|---|---|---|
| `DOCKGE_OIDC_ISSUER` | *(ninguno)* | URL del emisor. Al definirla se activa OIDC. El descubrimiento usa `<issuer>/.well-known/openid-configuration` |
| `DOCKGE_OIDC_CLIENT_ID` | *(obligatorio)* | ID del cliente |
| `DOCKGE_OIDC_CLIENT_SECRET` | *(ninguno)* | Secreto del cliente. Déjalo vacío para un cliente público |
| `DOCKGE_OIDC_CLIENT_SECRET_FILE` | *(ninguno)* | Archivo con el secreto (recomendado, tiene prioridad) |
| `DOCKGE_OIDC_REDIRECT_URI` | *(obligatorio)* | URL pública de callback, que termina en `/api/auth/oidc/callback` |
| `DOCKGE_OIDC_SCOPES` | `openid profile email` | Scopes solicitados |
| `DOCKGE_OIDC_USERNAME_CLAIM` | `preferred_username` | Claim usado como nombre de usuario de Dockge (`email` también es habitual) |
| `DOCKGE_OIDC_GROUPS_CLAIM` | `groups` | Claim que contiene los grupos del usuario |
| `DOCKGE_OIDC_ADMIN_USERS` | *(ninguno)* | Nombres de usuario, separados por comas, que pasan a ser administradores |
| `DOCKGE_OIDC_ADMIN_GROUPS` | *(ninguno)* | Grupos, separados por comas, cuyos miembros son administradores (ver más abajo) |
| `DOCKGE_OIDC_LINK_EXISTING` | `false` | Permite que el primer inicio de sesión OIDC vincule una cuenta local existente con el mismo nombre de usuario |
| `DOCKGE_OIDC_DISABLE_LOCAL_LOGIN` | `false` | Oculta el formulario de usuario/contraseña y rechaza los inicios de sesión con contraseña |
| `DOCKGE_OIDC_BUTTON_LABEL` | «Iniciar sesión con SSO» (traducido) | Texto del botón de inicio de sesión |
| `DOCKGE_OIDC_ALLOW_HTTP` | `false` | Permite URL `http://` para el emisor y la redirección. **Solo para pruebas locales** |

Dockge no arranca si la configuración está incompleta, por ejemplo sin ID de cliente o URI de redirección, o con `DOCKGE_OIDC_DISABLE_LOCAL_LOGIN` sin emisor. La URI de redirección procede únicamente de la configuración, nunca de las cabeceras de la petición. Si el proveedor no está accesible, el inicio de sesión local sigue funcionando y el botón SSO muestra el error.

### Ejemplo: Pocket ID

```yaml
services:
  dockge:
    environment:
      - DOCKGE_OIDC_ISSUER=https://id.example.com
      - DOCKGE_OIDC_CLIENT_ID=0f6c...                     # desde Pocket ID → OIDC Clients
      - DOCKGE_OIDC_CLIENT_SECRET_FILE=/run/secrets/dockge_oidc_secret
      - DOCKGE_OIDC_REDIRECT_URI=https://dockge.example.com/api/auth/oidc/callback
      - DOCKGE_OIDC_SCOPES=openid profile email groups
      - DOCKGE_OIDC_ADMIN_GROUPS=dockge-admins
      - DOCKGE_OIDC_BUTTON_LABEL=Iniciar sesión con Pocket ID
    secrets:
      - dockge_oidc_secret

secrets:
  dockge_oidc_secret:
    file: ./secrets/dockge_oidc_secret
```

En Authentik, el emisor es el «OpenID Configuration Issuer» de la aplicación, por ejemplo `https://auth.example.com/application/o/dockge/`. En Keycloak es `https://kc.example.com/realms/<realm>`.

## Cuentas y roles

- Cada identidad OIDC se vincula a una cuenta de Dockge mediante el identificador estable del proveedor (emisor + `sub`). Renombrar un usuario en el proveedor no crea una cuenta nueva.
- En el primer inicio de sesión, una cuenta inexistente se crea como **cuenta limitada sin permisos sobre stacks**: no ve nada hasta que un administrador le conceda acceso en **Ajustes → Seguridad → Usuarios y permisos**. Allí las cuentas vinculadas muestran una insignia **SSO**.
- Los **administradores** se obtienen de `DOCKGE_OIDC_ADMIN_USERS` y `DOCKGE_OIDC_ADMIN_GROUPS`:
  - Si `DOCKGE_OIDC_ADMIN_GROUPS` está definido, la pertenencia al grupo manda en cada inicio de sesión: unirse al grupo concede derechos de administrador y salir de él devuelve la cuenta a cuenta limitada. La cuenta conserva sus permisos sobre stacks. Las sesiones abiertas se reconectan con el nuevo rol.
  - Con solo `DOCKGE_OIDC_ADMIN_USERS`, los usuarios indicados se promueven y nadie es degradado nunca.
- **No existe la regla implícita «el primer usuario se convierte en administrador».** En una instalación nueva, crea el primer administrador con la página de configuración inicial o `DOCKGE_BOOTSTRAP_*`, o configura una correspondencia de administración. De lo contrario, el primer inicio de sesión OIDC se rechaza con una explicación, para que una instalación con solo cuentas limitadas no te deje fuera.
- Las **cuentas locales existentes** no se vinculan por defecto: se rechaza un usuario OIDC cuyo nombre coincide con una cuenta local. Define `DOCKGE_OIDC_LINK_EXISTING=true` para vincularlas en el primer inicio de sesión. Cuando el claim del nombre de usuario es `email`, la vinculación exige además `email_verified` a true. Así, un usuario del proveedor que pueda elegir su propio nombre o correo no puede apropiarse de un administrador local.
- Desactivar una cuenta en Dockge también bloquea su inicio de sesión OIDC.

## 2FA

Los inicios de sesión OIDC no piden el código TOTP local: la autenticación multifactor es responsabilidad del proveedor. La 2FA local sigue aplicándose a los inicios de sesión con contraseña de la misma cuenta.

## Desactivar el inicio de sesión local

Con `DOCKGE_OIDC_DISABLE_LOCAL_LOGIN=true`, la página de inicio de sesión solo muestra el botón SSO y el servidor rechaza los inicios de sesión con contraseña. Las sesiones existentes, los tokens de federación entre instancias y la página de configuración inicial siguen funcionando.

**Recuperación:** si el proveedor deja de estar disponible, elimina `DOCKGE_OIDC_DISABLE_LOCAL_LOGIN` y reinicia el contenedor para iniciar sesión con una cuenta de administrador local.

## Aún no incluido

- Correspondencia de grupos con permisos por stack (solo se mapea el rol de administrador).
- Cierre de sesión en el proveedor (RP-initiated logout): **Cerrar sesión** solo cierra la sesión de Dockge.
- Configuración desde la interfaz de Ajustes: OIDC se configura con variables de entorno.
