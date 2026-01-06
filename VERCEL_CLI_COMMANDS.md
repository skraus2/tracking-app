# Vercel CLI Befehle - Komplette Übersicht

## Installation

```bash
# Vercel CLI global installieren
npm install -g vercel

# Oder mit pnpm
pnpm add -g vercel

# Version prüfen
vercel --version
```

## Authentifizierung

```bash
# Bei Vercel einloggen (öffnet Browser)
vercel login

# Ausloggen
vercel logout

# Aktuellen Benutzer anzeigen
vercel whoami
```

## Deployment

```bash
# Preview Deployment (Standard)
vercel

# Production Deployment
vercel --prod

# Deployment mit Bestätigung
vercel --prod --yes

# Deployment ohne Domain-Zuweisung
vercel --prod --skip-domain

# Neues Deployment erzwingen (ohne Cache)
vercel --prod --force

# Deployment mit bestimmter Region
vercel --prod --regions fra1

# Deployment mit Debug-Output
vercel --prod --debug

# Deployment mit bestimmter Umgebung
vercel --prod --env production
```

## Projekt-Verwaltung

```bash
# Projekt-Informationen abrufen
vercel inspect

# Projekt-Informationen als JSON
vercel inspect --json

# Alle Projekte auflisten
vercel projects ls

# Projekt-Details anzeigen
vercel projects inspect <project-name>

# Projekt erstellen
vercel projects add <project-name>

# Projekt löschen
vercel projects remove <project-name>

# Projekt mit Git verbinden
vercel link

# Projekt-Verbindung entfernen
vercel unlink
```

## Deployment-Verwaltung

```bash
# Alle Deployments auflisten
vercel ls

# Deployment-Details anzeigen
vercel inspect <deployment-url>

# Deployment entfernen
vercel remove <deployment-url>

# Deployment-Status prüfen
vercel ls --prod

# Deployments nach Projekt filtern
vercel ls <project-name>
```

## Umgebungsvariablen

```bash
# Alle Umgebungsvariablen anzeigen
vercel env ls

# Umgebungsvariable hinzufügen (interaktiv)
vercel env add <variable-name>

# Umgebungsvariable hinzufügen (nicht-interaktiv)
echo "value" | vercel env add <variable-name> production

# Umgebungsvariable für alle Environments hinzufügen
vercel env add <variable-name> production preview development

# Umgebungsvariable entfernen
vercel env rm <variable-name> production

# Umgebungsvariablen lokal abrufen
vercel env pull .env.local

# Umgebungsvariablen in bestimmte Datei abrufen
vercel env pull .env.production production

# Umgebungsvariable anzeigen
vercel env ls <variable-name>
```

## Logs

```bash
# Logs anzeigen (letzte 100 Zeilen)
vercel logs

# Logs für bestimmtes Deployment
vercel logs <deployment-url>

# Logs für Production
vercel logs --prod

# Logs folgen (live)
vercel logs --follow

# Logs mit mehr Zeilen
vercel logs --output raw

# Logs für bestimmte Funktion
vercel logs --function <function-name>
```

## Domains

```bash
# Alle Domains auflisten
vercel domains ls

# Domain hinzufügen
vercel domains add <domain-name>

# Domain entfernen
vercel domains rm <domain-name>

# Domain-Informationen anzeigen
vercel domains inspect <domain-name>

# Domain für Projekt hinzufügen
vercel domains add <domain-name> --project <project-name>
```

## Teams

```bash
# Alle Teams auflisten
vercel teams ls

# Team-Details anzeigen
vercel teams inspect <team-slug>

# Team wechseln
vercel teams switch <team-slug>
```

## Secrets

```bash
# Alle Secrets auflisten
vercel secrets ls

# Secret hinzufügen
vercel secrets add <secret-name> <secret-value>

# Secret entfernen
vercel secrets rm <secret-name>

# Secret anzeigen (nur Name, nicht Wert)
vercel secrets inspect <secret-name>
```

## Build & Development

```bash
# Lokalen Development-Server starten
vercel dev

# Development-Server mit bestimmter Port
vercel dev --listen 3000

# Build lokal testen
vercel build

# Build-Output anzeigen
vercel build --debug
```

## Alias & Redirects

```bash
# Alias hinzufügen
vercel alias <deployment-url> <alias-domain>

# Alias entfernen
vercel alias rm <alias-domain>

# Alle Aliases anzeigen
vercel alias ls
```

## Debugging & Troubleshooting

```bash
# Debug-Modus aktivieren
vercel --debug

# Verbose Output
vercel --debug --verbose

# Build-Logs anzeigen
vercel build --debug

# Deployment-Informationen
vercel inspect <deployment-url> --debug
```

## Nützliche Kombinationen für Ihr Projekt

```bash
# 1. Erstes Setup
vercel login
vercel link

# 2. Umgebungsvariablen setzen
vercel env add DATABASE_URL production
vercel env add BETTER_AUTH_SECRET production
vercel env add NEXT_PUBLIC_APP_URL production
vercel env add RESEND_API_KEY production
vercel env add RESEND_FROM_EMAIL production

# 3. Production Deployment
vercel --prod

# 4. Logs überprüfen
vercel logs --prod --follow

# 5. Deployment-Status prüfen
vercel ls --prod

# 6. Umgebungsvariablen lokal abrufen (für lokale Tests)
vercel env pull .env.local

# 7. Projekt-Informationen anzeigen
vercel inspect

# 8. Neues Deployment nach Änderungen
vercel --prod --force
```

## Workflow für regelmäßige Deployments

```bash
# 1. Änderungen committen (falls Git verwendet wird)
git add .
git commit -m "Deployment: Beschreibung"
git push

# 2. Oder direkt deployen (ohne Git)
vercel --prod

# 3. Logs überprüfen
vercel logs --prod

# 4. Deployment-URL testen
# (URL wird nach Deployment angezeigt)
```

## Häufige Probleme & Lösungen

```bash
# Problem: "Project not found"
# Lösung: Projekt neu verlinken
vercel unlink
vercel link

# Problem: "Environment variables missing"
# Lösung: Variablen prüfen und hinzufügen
vercel env ls
vercel env add <variable-name> production

# Problem: "Build failed"
# Lösung: Lokalen Build testen
vercel build --debug

# Problem: "Deployment stuck"
# Lösung: Neues Deployment erzwingen
vercel --prod --force
```

## Hilfe & Dokumentation

```bash
# Hilfe zu einem Befehl anzeigen
vercel --help
vercel <command> --help

# Beispiel:
vercel deploy --help
vercel env --help
vercel logs --help
```

## Wichtige Flags

- `--prod` / `-p`: Production Deployment
- `--yes` / `-y`: Automatische Bestätigung
- `--force` / `-f`: Neues Deployment erzwingen
- `--debug` / `-d`: Debug-Modus
- `--env`: Umgebung angeben (production/preview/development)
- `--regions`: Region angeben (z.B. fra1, iad1)
- `--skip-domain`: Domain-Zuweisung überspringen
- `--follow` / `-f`: Logs live folgen
- `--output`: Output-Format (json/raw)
