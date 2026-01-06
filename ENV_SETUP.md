# Umgebungsvariablen auf Vercel setzen

Diese Anleitung zeigt, wie Sie die benötigten Umgebungsvariablen für Ihr Vercel-Projekt konfigurieren.

## Methode 1: Über Vercel Dashboard (Empfohlen)

### Schritt 1: Projekt öffnen
1. Gehen Sie zu [vercel.com/dashboard](https://vercel.com/dashboard)
2. Wählen Sie Ihr Projekt aus (z.B. `tracking-app`)

### Schritt 2: Zu Environment Variables navigieren
1. Klicken Sie auf **Settings** (oben im Menü)
2. Klicken Sie auf **Environment Variables** (linke Seitenleiste)

### Schritt 3: Variablen hinzufügen

Fügen Sie für jede Variable folgende Schritte aus:

#### 1. DATABASE_URL
- **Key**: `DATABASE_URL`
- **Value**: Ihre PostgreSQL Connection String (z.B. von Vercel Postgres, Neon, Supabase)
  - Format: `postgresql://user:password@host:5432/database?sslmode=require`
- **Environments**: ✅ Production, ✅ Preview, ✅ Development
- Klicken Sie auf **Save**

#### 2. BETTER_AUTH_SECRET
- **Key**: `BETTER_AUTH_SECRET`
- **Value**: Generieren Sie einen sicheren Secret:
  ```bash
  openssl rand -base64 32
  ```
  Oder verwenden Sie einen anderen sicheren zufälligen String
- **Environments**: ✅ Production, ✅ Preview, ✅ Development
- Klicken Sie auf **Save**

#### 3. NEXT_PUBLIC_APP_URL
- **Key**: `NEXT_PUBLIC_APP_URL`
- **Value**: Ihre Vercel-URL (wird nach dem ersten Deployment angezeigt)
  - Format: `https://ihr-projekt.vercel.app`
  - Oder Ihre Custom Domain: `https://ihre-domain.com`
- **Environments**: ✅ Production, ✅ Preview, ✅ Development
- Klicken Sie auf **Save**

#### 4. RESEND_API_KEY
- **Key**: `RESEND_API_KEY`
- **Value**: Ihr Resend API Key (beginnend mit `re_`)
- **Environments**: ✅ Production, ✅ Preview, ✅ Development
- Klicken Sie auf **Save**

#### 5. RESEND_FROM_EMAIL
- **Key**: `RESEND_FROM_EMAIL`
- **Value**: Ihre Email-Adresse für ausgehende Emails (z.B. `no-reply@ihre-domain.com`)
- **Environments**: ✅ Production, ✅ Preview, ✅ Development
- Klicken Sie auf **Save**

### Schritt 4: Deployment neu starten

Nach dem Setzen aller Variablen:
1. Gehen Sie zu **Deployments** (oben im Menü)
2. Klicken Sie auf die drei Punkte (⋯) beim neuesten Deployment
3. Wählen Sie **Redeploy**
4. Oder deployen Sie erneut über CLI: `vercel --prod`

## Methode 2: Über Vercel CLI

### Schritt 1: Im Projektverzeichnis

```bash
cd "/Users/simonkraus/Downloads/Neuer Ordner 8/next nino/tracking-app"
```

### Schritt 2: Variablen hinzufügen

Für jede Variable werden Sie interaktiv nach dem Wert gefragt:

```bash
# DATABASE_URL für Production
vercel env add DATABASE_URL production

# DATABASE_URL für Preview
vercel env add DATABASE_URL preview

# DATABASE_URL für Development
vercel env add DATABASE_URL development

# BETTER_AUTH_SECRET für alle Environments
vercel env add BETTER_AUTH_SECRET production
vercel env add BETTER_AUTH_SECRET preview
vercel env add BETTER_AUTH_SECRET development

# NEXT_PUBLIC_APP_URL für alle Environments
vercel env add NEXT_PUBLIC_APP_URL production
vercel env add NEXT_PUBLIC_APP_URL preview
vercel env add NEXT_PUBLIC_APP_URL development

# RESEND_API_KEY für alle Environments
vercel env add RESEND_API_KEY production
vercel env add RESEND_API_KEY preview
vercel env add RESEND_API_KEY development

# RESEND_FROM_EMAIL für alle Environments
vercel env add RESEND_FROM_EMAIL production
vercel env add RESEND_FROM_EMAIL preview
vercel env add RESEND_FROM_EMAIL development
```

### Schritt 3: Variablen anzeigen

```bash
# Alle Umgebungsvariablen anzeigen
vercel env ls
```

### Schritt 4: Erneut deployen

```bash
vercel --prod
```

## Wichtige Hinweise

### DATABASE_URL
- **Für Vercel Postgres**: Die URL wird automatisch als Umgebungsvariable hinzugefügt, wenn Sie Vercel Postgres im Dashboard erstellen
- **Für externe Datenbanken**: Stellen Sie sicher, dass SSL aktiviert ist (`?sslmode=require`)
- **Format**: `postgresql://user:password@host:5432/database?sslmode=require`

### BETTER_AUTH_SECRET
- **WICHTIG**: Verwenden Sie einen starken, zufälligen Secret
- **Generierung**: `openssl rand -base64 32`
- **Sicherheit**: Teilen Sie diesen Secret niemals öffentlich

### NEXT_PUBLIC_APP_URL
- **Nach dem ersten Deployment**: Sie erhalten eine URL wie `https://tracking-app-xyz.vercel.app`
- **Für Production**: Setzen Sie diese auf Ihre finale URL
- **Wichtig**: Diese Variable wird Client-Side verwendet (wegen `NEXT_PUBLIC_` Prefix)

### Environment-Unterschiede
- **Production**: Live-Umgebung für Endnutzer
- **Preview**: Automatische Deployments für Pull Requests/Branches
- **Development**: Lokale Entwicklung (wird selten verwendet)

## Troubleshooting

### Variablen werden nicht übernommen
- **Lösung**: Deployen Sie das Projekt erneut nach dem Setzen der Variablen
- **CLI**: `vercel --prod`
- **Dashboard**: Redeploy über das Deployment-Menü

### DATABASE_URL Fehler
- **Prüfen**: Ist SSL aktiviert? (`?sslmode=require`)
- **Prüfen**: Ist die Datenbank von Vercel aus erreichbar? (Firewall-Einstellungen)
- **Prüfen**: Ist die URL korrekt formatiert?

### NEXT_PUBLIC_APP_URL Fehler
- **Prüfen**: Beginnt die URL mit `https://`?
- **Prüfen**: Ist die URL ohne trailing slash? (z.B. `https://app.vercel.app` nicht `https://app.vercel.app/`)

### BETTER_AUTH_SECRET Fehler
- **Prüfen**: Ist der Secret lang genug? (mindestens 32 Zeichen empfohlen)
- **Prüfen**: Wurde der Secret für alle Environments gesetzt?

## Checkliste

- [ ] DATABASE_URL für alle Environments gesetzt
- [ ] BETTER_AUTH_SECRET generiert und gesetzt
- [ ] NEXT_PUBLIC_APP_URL auf Ihre Vercel-URL gesetzt
- [ ] RESEND_API_KEY gesetzt
- [ ] RESEND_FROM_EMAIL gesetzt
- [ ] Projekt erneut deployed (`vercel --prod`)






