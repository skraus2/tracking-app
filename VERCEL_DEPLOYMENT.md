# Vercel Deployment Guide

Diese Anleitung zeigt, wie Sie die Tracking-App (Frontend und Backend) auf Vercel hosten können.

## Übersicht

Ihr Projekt ist eine Next.js 16 App mit:
- **Frontend**: Next.js App Router mit React 19
- **Backend**: Next.js API Routes
- **Datenbank**: PostgreSQL mit Prisma ORM
- **Authentifizierung**: Better Auth
- **Email**: Resend

## Voraussetzungen

1. **Vercel Account**: Erstellen Sie einen Account auf [vercel.com](https://vercel.com)
2. **PostgreSQL Datenbank**: Sie benötigen eine PostgreSQL-Datenbank (z.B. Vercel Postgres, Neon, Supabase, oder eine andere)
3. **Node.js und pnpm**: Installiert auf Ihrem lokalen Rechner

## Schritt 1: Projekt auf Vercel deployen

### Option A: Deployment OHNE Git (Empfohlen für Sie)

Diese Methode deployt Ihr Projekt direkt von Ihrem lokalen Rechner ohne Git-Repository.

#### 1. Vercel CLI installieren

```bash
npm install -g vercel
```

#### 2. Im Projektverzeichnis navigieren

```bash
cd "/Users/simonkraus/Downloads/Neuer Ordner 8/next nino/tracking-app"
```

#### 3. Bei Vercel einloggen

```bash
vercel login
```

Dies öffnet Ihren Browser für die Authentifizierung.

#### 4. Projekt erstellen und deployen

**Erstes Deployment (Preview):**
```bash
vercel
```

Folgen Sie den Anweisungen:
- Set up and deploy? **Y**
- Which scope? Wählen Sie Ihren Account oder Team
- Link to existing project? **N** (beim ersten Mal)
- What's your project's name? z.B. `tracking-app`
- In which directory is your code located? **./** (Enter drücken)

**Production Deployment:**
```bash
vercel --prod
```

#### 5. Umgebungsvariablen setzen

Nach dem ersten Deployment müssen Sie die Umgebungsvariablen konfigurieren:

**Option 1: Über Vercel Dashboard (Empfohlen)**
1. Gehen Sie zu [vercel.com/dashboard](https://vercel.com/dashboard)
2. Wählen Sie Ihr Projekt aus
3. Gehen Sie zu **Settings → Environment Variables**
4. Fügen Sie alle benötigten Variablen hinzu (siehe Schritt 3)

**Option 2: Über Vercel CLI**
```bash
# Umgebungsvariablen hinzufügen
vercel env add DATABASE_URL production
vercel env add BETTER_AUTH_SECRET production
vercel env add NEXT_PUBLIC_APP_URL production
vercel env add RESEND_API_KEY production
vercel env add RESEND_FROM_EMAIL production

# Für Preview und Development ebenfalls setzen
vercel env add DATABASE_URL preview
vercel env add BETTER_AUTH_SECRET preview
# ... usw.
```

#### 6. Erneut deployen mit Umgebungsvariablen

```bash
vercel --prod
```

### Option B: Deployment MIT Git (Optional)

Falls Sie später Git verwenden möchten:

1. Gehen Sie zu [vercel.com/new](https://vercel.com/new)
2. Wählen Sie "Import Git Repository"
3. Verbinden Sie Ihr GitHub/GitLab/Bitbucket Repository
4. Vercel erkennt automatisch Next.js als Framework

## Schritt 2: Build-Konfiguration

Vercel erkennt Next.js automatisch, aber Sie müssen Prisma für den Build-Prozess konfigurieren.

### Build Command anpassen

In den Vercel Project Settings → Build & Development Settings:

**Build Command:**
```bash
prisma generate && prisma migrate deploy && next build
```

Oder wenn Sie `pnpm` verwenden:
```bash
pnpm prisma generate && pnpm prisma migrate deploy && pnpm build
```

**Install Command:**
```bash
pnpm install
```

**Output Directory:**
```
.next
```

## Schritt 3: Umgebungsvariablen konfigurieren

Gehen Sie zu **Project Settings → Environment Variables** und fügen Sie folgende Variablen hinzu:

### Erforderliche Umgebungsvariablen

#### 1. Datenbank
```
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require
```
- **Wichtig**: Verwenden Sie eine PostgreSQL-Datenbank mit SSL-Unterstützung
- **Empfehlung**: Vercel Postgres, Neon, Supabase, oder Railway

#### 2. Better Auth
```
BETTER_AUTH_SECRET=<generieren-sie-einen-sicheren-secret>
```
Generieren Sie einen sicheren Secret:
```bash
openssl rand -base64 32
```

#### 3. App URL
```
NEXT_PUBLIC_APP_URL=https://ihr-projekt.vercel.app
```
- Setzen Sie dies auf Ihre Vercel-Deployment-URL
- Für Production: Ihre Custom Domain (z.B. `https://tracking.example.com`)

#### 4. Resend Email
```
RESEND_API_KEY=re_ihr-resend-api-key
RESEND_FROM_EMAIL=no-reply@ihre-domain.com
```

### Umgebungsvariablen für alle Environments setzen

Stellen Sie sicher, dass die Variablen für folgende Environments gesetzt sind:
- ✅ Production
- ✅ Preview
- ✅ Development

## Schritt 4: Datenbank einrichten

### Option A: Vercel Postgres (Empfohlen)

1. Gehen Sie zu Ihrem Vercel Project
2. Navigieren Sie zu **Storage → Create Database → Postgres**
3. Erstellen Sie eine neue Postgres-Datenbank
4. Die `DATABASE_URL` wird automatisch als Umgebungsvariable hinzugefügt

### Option B: Externe PostgreSQL-Datenbank

Wenn Sie eine externe Datenbank verwenden (z.B. Neon, Supabase):

1. Erstellen Sie eine PostgreSQL-Datenbank
2. Kopieren Sie die Connection String
3. Fügen Sie sie als `DATABASE_URL` Umgebungsvariable hinzu
4. **Wichtig**: Stellen Sie sicher, dass SSL aktiviert ist (`?sslmode=require`)

### Datenbank-Schema anwenden

Nach dem ersten Deployment müssen Sie die Datenbank-Migrationen ausführen:

**Option 1: Automatisch über Build Command**
Der Build Command `prisma migrate deploy` führt die Migrationen automatisch aus.

**Option 2: Manuell über Vercel CLI**
```bash
vercel env pull .env.local
npx prisma migrate deploy
```

**Option 3: Über Vercel Postgres Dashboard**
Wenn Sie Vercel Postgres verwenden, können Sie die Migrationen auch über das Dashboard ausführen.

## Schritt 5: Regionen konfigurieren (Optional)

Vercel bietet Serverless Functions in verschiedenen Regionen weltweit. Die Standard-Region ist `iad1` (Washington, D.C., USA).

### Verfügbare Regionen

**Nordamerika:**
- `iad1` - Washington, D.C., USA (Standard)
- `sfo1` - San Francisco, USA
- `cle1` - Cleveland, USA

**Europa:**
- `fra1` - Frankfurt, Deutschland
- `lhr1` - London, UK
- `cdg1` - Paris, Frankreich
- `dub1` - Dublin, Irland
- `ams1` - Amsterdam, Niederlande

**Asien:**
- `sin1` - Singapur
- `hnd1` - Tokyo, Japan
- `syd1` - Sydney, Australien
- `icn1` - Seoul, Südkorea

**Südamerika:**
- `gru1` - São Paulo, Brasilien

### Region in vercel.json setzen

Falls Sie eine bestimmte Region verwenden möchten, können Sie diese in `vercel.json` hinzufügen:

```json
{
  "regions": ["fra1"]
}
```

**Hinweise:**
- **Hobby Plan**: Kann eine Region auswählen
- **Pro/Enterprise Plan**: Kann bis zu 3 Regionen für bessere Performance konfigurieren
- Wenn keine Region angegeben wird, verwendet Vercel standardmäßig `iad1`
- Statische Dateien werden immer global bereitgestellt (Edge Network)

### Region über CLI setzen

```bash
vercel --regions fra1
```

## Schritt 6: vercel.json (Bereits konfiguriert)

Die `vercel.json` Datei ist bereits im Projekt vorhanden und konfiguriert:

```json
{
  "buildCommand": "prisma generate && prisma migrate deploy && next build",
  "installCommand": "pnpm install",
  "framework": "nextjs"
}
```

**Hinweis**: Die `buildCommand` in `vercel.json` überschreibt die Einstellungen im Dashboard.

## Schritt 7: Prisma Client Generation

Stellen Sie sicher, dass Prisma Client während des Builds generiert wird. Der Build Command sollte `prisma generate` enthalten.

Falls Sie Probleme haben, können Sie auch ein `postinstall` Script in `package.json` hinzufügen:

```json
{
  "scripts": {
    "postinstall": "prisma generate"
  }
}
```

## Schritt 8: Deployment

### Deployment ohne Git (Ihre Methode)

Nachdem Sie die Umgebungsvariablen gesetzt haben:

```bash
# Production Deployment
vercel --prod

# Oder Preview Deployment
vercel
```

### Deployment mit Git (Falls später gewünscht)

1. Pushen Sie Ihren Code zu GitHub/GitLab/Bitbucket
2. Vercel erkennt automatisch neue Commits und startet ein Deployment
3. Überwachen Sie den Build-Prozess im Vercel Dashboard

### Nach dem Deployment

1. **Datenbank-Migrationen prüfen**: Stellen Sie sicher, dass alle Migrationen erfolgreich ausgeführt wurden
2. **Umgebungsvariablen überprüfen**: Testen Sie, ob alle Variablen korrekt gesetzt sind
3. **App testen**: Besuchen Sie Ihre Deployment-URL und testen Sie die Funktionalität

## Schritt 9: Custom Domain (Optional)

1. Gehen Sie zu **Project Settings → Domains**
2. Fügen Sie Ihre Custom Domain hinzu
3. Folgen Sie den DNS-Anweisungen
4. Aktualisieren Sie `NEXT_PUBLIC_APP_URL` mit Ihrer Custom Domain

## Schritt 10: Webhooks konfigurieren

### Shopify Webhooks

Da Ihre App Shopify Webhooks verwendet, müssen Sie die Webhook-URLs in Shopify aktualisieren:

1. Gehen Sie zu Ihrem Shopify Admin
2. Navigieren Sie zu **Settings → Notifications → Webhooks**
3. Aktualisieren Sie die Webhook-URLs auf:
   - `https://ihr-projekt.vercel.app/api/webhooks/orders/create`
   - `https://ihr-projekt.vercel.app/api/webhooks/fulfillments/create`
   - `https://ihr-projekt.vercel.app/api/webhooks/fulfillments/update`

### 17Track Webhook

**17Track Webhook-URL:**
```
https://ihr-projekt.vercel.app/api/webhooks/trackings
```

**Wichtig:** Ersetzen Sie `ihr-projekt.vercel.app` mit Ihrer tatsächlichen Vercel-URL.

**17Track Webhook konfigurieren:**

17Track sendet automatisch Webhooks an diese URL, wenn Sie Tracking-Nummern registrieren. Die Webhook-URL muss in Ihrem 17Track Account konfiguriert werden:

1. **Über 17Track Dashboard:**
   - Loggen Sie sich in Ihr 17Track Developer Account ein
   - Gehen Sie zu **API Settings** oder **Webhook Configuration**
   - Fügen Sie die Webhook-URL hinzu: `https://ihr-projekt.vercel.app/api/webhooks/trackings`
   - Stellen Sie sicher, dass die Events `TRACKING_UPDATED` und `TRACKING_STOPPED` aktiviert sind

2. **Über 17Track API (falls verfügbar):**
   - Verwenden Sie die 17Track API, um die Webhook-URL zu setzen
   - Die Webhook-URL wird bei der Registrierung von Tracking-Nummern verwendet

**Webhook-Sicherheit:**
- 17Track sendet einen `sign` Header mit jeder Webhook-Anfrage
- Die Signatur wird automatisch verifiziert (SHA256 von `{payload}/API_KEY`)
- Stellen Sie sicher, dass Ihr 17Track API Key in den Settings konfiguriert ist

**Webhook-Events:**
- `TRACKING_UPDATED`: Wird gesendet, wenn sich der Tracking-Status ändert
- `TRACKING_STOPPED`: Wird gesendet, wenn das Tracking gestoppt wird

## Troubleshooting

### Build-Fehler: Prisma Client nicht gefunden

**Lösung**: Stellen Sie sicher, dass `prisma generate` im Build Command enthalten ist:
```bash
prisma generate && prisma migrate deploy && next build
```

### Datenbank-Verbindungsfehler

**Lösung**: 
- Überprüfen Sie die `DATABASE_URL` Format
- Stellen Sie sicher, dass SSL aktiviert ist (`?sslmode=require`)
- Prüfen Sie, ob die Datenbank von Vercel aus erreichbar ist (Firewall-Einstellungen)

### Migration-Fehler

**Lösung**:
- Führen Sie `prisma migrate deploy` lokal aus, um zu sehen, welche Migrationen fehlen
- Stellen Sie sicher, dass alle Migrationen im `prisma/migrations` Ordner vorhanden sind

### Umgebungsvariablen nicht verfügbar

**Lösung**:
- Überprüfen Sie, ob die Variablen für das richtige Environment gesetzt sind
- Variablen mit `NEXT_PUBLIC_` Prefix sind für Client-Side verfügbar
- Andere Variablen sind nur Server-Side verfügbar

### Webhook-Fehler

**Lösung**:
- Stellen Sie sicher, dass `NEXT_PUBLIC_APP_URL` auf Ihre Vercel-URL gesetzt ist
- Überprüfen Sie die Webhook-URLs in Shopify
- Testen Sie die Webhook-Endpunkte manuell

## Nützliche Vercel CLI Befehle

```bash
# Projekt-Informationen abrufen
vercel inspect

# Umgebungsvariablen lokal abrufen
vercel env pull .env.local

# Logs anzeigen
vercel logs

# Projekt löschen
vercel remove

# Production Deployment
vercel --prod

# Preview Deployment
vercel

# Deployment mit bestimmter Region
vercel --regions fra1

# Deployment ohne Domain-Zuweisung
vercel --prod --skip-domain

# Neues Deployment erzwingen (ohne Cache)
vercel --force

# Deployment-Status prüfen
vercel ls
```

## Best Practices

1. **Environment Variables**: Verwenden Sie unterschiedliche Werte für Production, Preview und Development
2. **Database Migrations**: Führen Sie Migrationen immer in der richtigen Reihenfolge aus
3. **Secrets**: Verwenden Sie Vercel's Secret Management für sensible Daten
4. **Monitoring**: Überwachen Sie Ihre Deployments im Vercel Dashboard
5. **Backups**: Erstellen Sie regelmäßig Backups Ihrer Datenbank

## Support

- [Vercel Dokumentation](https://vercel.com/docs)
- [Next.js Deployment Guide](https://nextjs.org/docs/app/building-your-application/deploying)
- [Prisma Deployment Guide](https://www.prisma.io/docs/guides/deployment)

