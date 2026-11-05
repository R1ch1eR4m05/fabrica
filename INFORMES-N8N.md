# Informe diario de Muse → fábrica (en el VPS)

## 0. La fábrica en el VPS (una sola vez)
```
cd ~ && git clone https://github.com/R1ch1eR4m05/fabrica.git && cd fabrica && bash instalar-vps.sh
```
Al final te muestra la **clave del panel** (queda en `~/fabrica/.env` como `PANEL_CLAVE`). Llena el resto del `.env` igual que en la laptop
(`nano ~/fabrica/.env`) y reinicia: `sudo systemctl restart fabrica`. Para actualizar después: `bash ~/fabrica/actualizar-vps.sh`.

> Seguridad: el panel va por http con usuario y clave. Lo ideal es **no dejar el puerto 4870 abierto a internet**:
> `sudo ufw deny 4870` y entra desde tu laptop con un túnel: `ssh -L 4870:127.0.0.1:4870 usuario@IP-DEL-VPS` → abre http://127.0.0.1:4870.
> n8n, que vive en el mismo VPS, la sigue alcanzando por dentro.

## 1. Lo que le pides a Muse (en WhatsApp)
> Todos los días a las 7 a. m. investiga qué frases y videos de crianza para mamás hispanas se hicieron virales en TikTok, Instagram y Facebook
> en las últimas 24 horas: enlace, cuenta, la frase que aparece en pantalla, vistas/guardados/compartidos si se ven y qué clip de fondo usan.
> Agrega los patrones que veas. Mándamelo por correo a TU-CORREO con el asunto **INFORME FABRICA**.

(En el Investigador, "Copiar prompt para Deep Research" te da una versión más completa con tu nicho.)

## 2. El flujo de n8n
1. n8n → **Workflows → Import from file** → `n8n/informe-diario-muse.json`.
2. Nodo **Correo de Muse (Gmail)**: elige tu credencial de Gmail. Revisa cada hora los correos con asunto "INFORME FABRICA".
3. Nodo **Mandar a la fábrica**:
   - Credencial **Basic Auth**: usuario `fabrica`, contraseña = tu `PANEL_CLAVE`.
   - URL: si n8n corre en **Docker** déjala en `http://172.17.0.1:4870/...` (la IP del VPS vista desde Docker).
     Si n8n está instalado directo (sin Docker), cámbiala a `http://127.0.0.1:4870/...`.
4. (Opcional) Nodo **Avisarme por WhatsApp**: pon la URL de tu Evolution API, tu instancia, la apikey y tu número, y actívalo.
5. **Activa** el flujo.

Si n8n no alcanza la fábrica: en el `.env` de la fábrica debe estar `HOST=0.0.0.0` (el instalador del VPS ya lo pone).

## 3. Qué pasa después
- Con `GEMINI_API_KEY` (gratis) el informe se convierte en propuestas al momento.
- Sin llave queda pendiente: en Claude Code di "convierte los informes pendientes".
- Abres el **Investigador** y cada propuesta tiene "Crear video 9:16" (o "Crear y hacer todas").

## Otras formas de mandar informes
- Pegarlo en el Investigador → "Importar un informe".
- Soltar un .md/.txt/.csv/.json/.html en `investigacion/entrada/` (se importa solo cada minuto).
