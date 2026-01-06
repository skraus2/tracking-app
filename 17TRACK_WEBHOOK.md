# 17Track Webhook Konfiguration

## Webhook-URL

Die 17Track Webhook-URL für Ihre Vercel-Deployment ist:

```
https://ihr-projekt.vercel.app/api/webhooks/trackings
```

**Wichtig:** Ersetzen Sie `ihr-projekt.vercel.app` mit Ihrer tatsächlichen Vercel-URL.

### Beispiel
Wenn Ihre Vercel-URL `https://tracking-app-abc123.vercel.app` ist, dann ist die Webhook-URL:
```
https://tracking-app-abc123.vercel.app/api/webhooks/trackings
```

## Webhook-Endpoint Details

- **URL**: `/api/webhooks/trackings`
- **Methode**: `POST`
- **Content-Type**: `application/json`
- **Signature Header**: `sign` (SHA256 Hash)

## Unterstützte Events

Ihre App verarbeitet folgende 17Track Webhook-Events:

1. **TRACKING_UPDATED**
   - Wird gesendet, wenn sich der Tracking-Status ändert
   - Aktualisiert die Tracking-Informationen in der Datenbank
   - Aktualisiert Shopify Fulfillment-Status (falls konfiguriert)

2. **TRACKING_STOPPED**
   - Wird gesendet, wenn ein Tracking gestoppt wird
   - Setzt den `processStatus` auf `Stopped` in der Datenbank

## Webhook-Sicherheit

17Track sendet eine Signatur mit jeder Webhook-Anfrage:

- **Header**: `sign`
- **Berechnung**: SHA256(`{payload}/API_KEY`)
- **Verifikation**: Automatisch durch die App verifiziert

**Wichtig:** Stellen Sie sicher, dass Ihr 17Track API Key in den App-Settings konfiguriert ist.

## 17Track Webhook konfigurieren

### Option 1: Über 17Track Dashboard

1. Loggen Sie sich in Ihr [17Track Developer Account](https://developer.17track.net/) ein
2. Navigieren Sie zu **API Settings** oder **Webhook Configuration**
3. Fügen Sie die Webhook-URL hinzu:
   ```
   https://ihr-projekt.vercel.app/api/webhooks/trackings
   ```
4. Aktivieren Sie die folgenden Events:
   - ✅ `TRACKING_UPDATED`
   - ✅ `TRACKING_STOPPED`

### Option 2: Über 17Track API

Falls 17Track eine API für Webhook-Konfiguration anbietet, können Sie die URL programmatisch setzen.

**Hinweis:** Die Webhook-URL wird normalerweise automatisch verwendet, wenn Sie Tracking-Nummern über die 17Track API registrieren. Stellen Sie sicher, dass die URL in Ihrem 17Track Account konfiguriert ist.

## Webhook-Payload Beispiel

### TRACKING_UPDATED Event

```json
{
  "event": "TRACKING_UPDATED",
  "data": {
    "number": "1234567890",
    "carrier": 1001,
    "tag": null,
    "track_info": {
      "latest_status": {
        "status": "InTransit",
        "sub_status": "InTransit_Other",
        "sub_status_descr": "In transit"
      },
      "latest_event": {
        "time_iso": "2024-01-15T10:30:00+00:00",
        "time_utc": "2024-01-15T10:30:00Z",
        "description": "Package in transit",
        "location": "New York, NY",
        "stage": "InTransit",
        "sub_status": "InTransit_Other"
      }
    }
  }
}
```

### TRACKING_STOPPED Event

```json
{
  "event": "TRACKING_STOPPED",
  "data": {
    "number": "1234567890",
    "carrier": 1001,
    "param": null,
    "tag": null
  }
}
```

## Webhook testen

### Manueller Test

Sie können die Webhook-URL manuell testen:

```bash
curl -X POST https://ihr-projekt.vercel.app/api/webhooks/trackings \
  -H "Content-Type: application/json" \
  -H "sign: test-signature" \
  -d '{
    "event": "TRACKING_UPDATED",
    "data": {
      "number": "TEST123",
      "carrier": 1001,
      "track_info": {
        "latest_status": {
          "status": "Delivered",
          "sub_status": "Delivered_Other"
        }
      }
    }
  }'
```

**Hinweis:** Der Test wird fehlschlagen, wenn die Signatur nicht korrekt ist. Für echte Tests verwenden Sie die 17Track API oder Dashboard.

## Troubleshooting

### Webhook wird nicht empfangen

1. **URL prüfen**: Stellen Sie sicher, dass die Webhook-URL korrekt in 17Track konfiguriert ist
2. **HTTPS**: Die URL muss mit `https://` beginnen (nicht `http://`)
3. **URL-Format**: Kein trailing slash (`/`) am Ende der URL
4. **Vercel Deployment**: Stellen Sie sicher, dass Ihre App erfolgreich auf Vercel deployed ist

### Signature Verification Failed

1. **API Key prüfen**: Stellen Sie sicher, dass der 17Track API Key in den App-Settings korrekt konfiguriert ist
2. **Signature Format**: Die Signatur wird als SHA256(`{payload}/API_KEY`) berechnet
3. **Header prüfen**: Der `sign` Header muss vorhanden sein

### Webhook-Events werden nicht verarbeitet

1. **Event-Typ prüfen**: Nur `TRACKING_UPDATED` und `TRACKING_STOPPED` werden unterstützt
2. **Payload-Format**: Stellen Sie sicher, dass der Payload das erwartete Format hat
3. **Logs prüfen**: Überprüfen Sie die Vercel Function Logs für Fehlermeldungen

## Nächste Schritte

1. ✅ Webhook-URL in 17Track konfigurieren
2. ✅ 17Track API Key in App-Settings setzen
3. ✅ Tracking-Nummer registrieren und Webhook testen
4. ✅ Vercel Function Logs überwachen

## Weitere Informationen

- [17Track API Dokumentation](https://developer.17track.net/)
- [Vercel Function Logs](https://vercel.com/docs/observability/logs)
- [Webhook Endpoint Code](/app/api/webhooks/trackings/route.ts)





