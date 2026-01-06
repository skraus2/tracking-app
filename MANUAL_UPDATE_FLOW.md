# Manual Update Flow - Dokumentation

## Übersicht

Der manuelle Update-Flow ermöglicht es Benutzern, den Tracking-Status eines Fulfillments manuell zu aktualisieren, indem die neuesten Informationen von 17Track abgerufen und in Shopify synchronisiert werden.

## Trigger

**Frontend:** `app/dashboard/trackings/page.tsx`

- Der Refresh-Button (🔄) wird nur angezeigt, wenn:
  - `processStatus === 'Running'` (Tracking ist aktiv)
- Button ist in der "Action" Spalte der Tracking-Tabelle

```typescript
{order.processStatus === 'Running' && (
  <Button
    variant="ghost"
    size="icon"
    onClick={() => handleManualUpdate(order.id)}
    title="Manually update tracking status"
  >
    <RefreshCw className="h-4 w-4" />
  </Button>
)}
```

## Flow-Diagramm

```
┌─────────────────────────────────────────────────────────────┐
│ 1. USER CLICKS REFRESH BUTTON                               │
│    - Frontend: handleManualUpdate(fulfillmentId)            │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. API REQUEST                                               │
│    POST /api/trackings/[id]                                 │
│    - fulfillmentId aus URL Parameter                       │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. AUTHENTICATION & AUTHORIZATION                           │
│    - requireAuth() prüft Benutzer                           │
│    - Admin: Zugriff auf alle Stores                         │
│    - Customer: Nur eigene Stores                            │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. FETCH FULFILLMENT                                        │
│    - Fulfillment aus DB laden                               │
│    - Include: shop, order, tracking                          │
│    - Validierung: trackingNumber vorhanden?                 │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. GET TRACKING INFO FROM 17TRACK                            │
│    track17Service.getTrackingInfo({                         │
│      number: fulfillment.trackingNumber                     │
│    })                                                        │
│                                                              │
│    API Call: POST https://api.17track.net/track/v2.4/      │
│              gettrackinfo                                   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. VALIDATE 17TRACK RESPONSE                                │
│    - Prüfe: accepted.length > 0?                           │
│    - Falls rejected: Fehler zurückgeben                     │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. MAP 17TRACK RESPONSE                                     │
│    track17Service.mapResponseToTracking(accepted)           │
│                                                              │
│    Mapping:                                                 │
│    - Status: 17Track → Track17MainStatus enum               │
│    - SubStatus: 17Track → Track17SubStatus enum             │
│    - Events: Extrahiere alle Events von allen Providers    │
│    - Sortiere Events nach Timestamp (neueste zuerst)       │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 8. FIND STATUS MAPPING                                      │
│    Prisma: StatusMapping.findFirst({                        │
│      track17Status: mappedInfo.status,                      │
│      track17SubStatus: mappedInfo.subStatus                 │
│    })                                                        │
│                                                              │
│    Fallback: Wenn kein exaktes Match:                       │
│    - Versuche nur mit mainStatus (subStatus = null)         │
│    - Falls nicht gefunden: Fehler                           │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 9. UPDATE SHOPIFY FULFILLMENT STATUS                        │
│    shopifyService.updateFulfillmentStatus(                  │
│      shopDomain,                                            │
│      clientId,                                              │
│      secret,                                                │
│      fulfillmentId,                                         │
│      shopifyStatus                                          │
│    )                                                         │
│                                                              │
│    WICHTIG: Shopify Update MUSS erfolgreich sein!          │
│    Falls Fehler: Ganzes Update wird abgebrochen            │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 10. UPDATE DATABASE (nur wenn Shopify erfolgreich)         │
│                                                              │
│    10a. Update Tracking Record (falls vorhanden):          │
│         - lastStatus: mappedInfo.status                    │
│         - lastSubStatus: mappedInfo.subStatus               │
│         - lastEventAt: mappedInfo.events[0].timestamp       │
│                                                              │
│    10b. Update Fulfillment Record:                           │
│         - statusCurrent: shopifyStatus                      │
│         - statusCurrentUpdatedAt: new Date()               │
│         - deliveredAt: new Date() (nur wenn DELIVERED)      │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 11. RETURN SUCCESS RESPONSE                                 │
│    {                                                         │
│      success: true,                                         │
│      data: {                                                │
│        id: fulfillmentId,                                   │
│        status: shopifyStatus,                               │
│        lastUpdated: timestamp                               │
│      }                                                       │
│    }                                                         │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 12. FRONTEND UPDATE                                         │
│    - Toast Success Message                                   │
│    - fetchTrackings(true) - Liste neu laden                 │
└─────────────────────────────────────────────────────────────┘
```

## Detaillierte Schritte

### Schritt 1-3: Frontend & API Request

**Datei:** `app/dashboard/trackings/page.tsx`

```typescript
const handleManualUpdate = async (fulfillmentId: string) => {
  try {
    const response = await fetch(`/api/trackings/${fulfillmentId}`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error('Failed to update tracking');
    }

    toast.success('Success', {
      description: 'Tracking status updated successfully',
    });

    fetchTrackings(true); // Liste neu laden
  } catch (error) {
    toast.error('Error', {
      description: error.message || 'Failed to update tracking',
    });
  }
};
```

### Schritt 4: Fulfillment laden

**Datei:** `app/api/trackings/[id]/route.ts`

```typescript
const fulfillment = await prisma.fulfillment.findUnique({
  where: { id },
  include: {
    shop: { select: { id, ownerId, shopDomain, clientId, secret } },
    order: true,
    tracking: true,
  },
});

// Validierungen:
// - Fulfillment existiert?
// - User hat Zugriff? (Admin oder Owner)
// - trackingNumber vorhanden?
```

### Schritt 5-6: 17Track API Call

**Datei:** `lib/services/track17.ts`

```typescript
const trackingInfo = await track17Service.getTrackingInfo({
  number: fulfillment.trackingNumber,
});

// API Endpoint: POST https://api.17track.net/track/v2.4/gettrackinfo
// Headers: { '17token': apiKey, 'Content-Type': 'application/json' }
// Body: [{ number: string, carrier?: number }]

// Response Format:
{
  code: 0,
  data: {
    accepted?: Array<{ number, carrier, track_info: {...} }>,
    rejected?: Array<{ number, error: { code, message } }>
  }
}
```

### Schritt 7: Response Mapping

**Datei:** `lib/services/track17.ts`

```typescript
const mappedInfo = track17Service.mapResponseToTracking(accepted);

// Mapping-Logik:
// 1. Status Mapping: 17Track String → Track17MainStatus enum
// 2. SubStatus Mapping: 17Track String → Track17SubStatus enum
// 3. Events Extraction: Alle Events von allen Providers sammeln
// 4. Events Sorting: Nach Timestamp sortieren (neueste zuerst)
```

**Status Mapping:**

- `NotFound` → `Track17MainStatus.NotFound`
- `InfoReceived` → `Track17MainStatus.InfoReceived`
- `InTransit` → `Track17MainStatus.InTransit`
- `Delivered` → `Track17MainStatus.Delivered`
- etc.

### Schritt 8: Status Mapping finden

**Datei:** `app/api/trackings/[id]/route.ts`

```typescript
// 1. Versuche exaktes Match
let statusMapping = await prisma.statusMapping.findFirst({
  where: {
    track17Status: mappedInfo.status,
    track17SubStatus: mappedInfo.subStatus || null,
  },
});

// 2. Fallback: Nur mit mainStatus
if (!statusMapping) {
  statusMapping = await prisma.statusMapping.findFirst({
    where: {
      track17Status: mappedInfo.status,
      track17SubStatus: null,
    },
  });
}

// 3. Falls nicht gefunden: Fehler
if (!statusMapping) {
  return createErrorResponse('No status mapping found', 500);
}

const shopifyStatus = statusMapping.shopifyStatus;
```

### Schritt 9: Shopify Update

**Datei:** `app/api/trackings/[id]/route.ts`

```typescript
const shopifyResult = await shopifyService.updateFulfillmentStatus(
  fulfillment.shop.shopDomain,
  fulfillment.shop.clientId,
  fulfillment.shop.secret,
  fulfillment.fulfillmentId,
  shopifyStatus as FulfillmentEventStatus
);

// WICHTIG: Falls Shopify Update fehlschlägt,
// wird das gesamte Update abgebrochen!
// Database wird NUR aktualisiert, wenn Shopify erfolgreich war.
```

### Schritt 10: Database Update

**Datei:** `app/api/trackings/[id]/route.ts`

```typescript
// 10a. Update Tracking Record (falls vorhanden)
if (fulfillment.tracking) {
  await prisma.tracking.update({
    where: { id: fulfillment.tracking.id },
    data: {
      lastStatus: mappedInfo.status,
      lastSubStatus: mappedInfo.subStatus || null,
      lastEventAt: mappedInfo.events[0]?.timestamp
        ? new Date(mappedInfo.events[0].timestamp)
        : new Date(),
    },
  });
}

// 10b. Update Fulfillment Record
const updatedFulfillment = await prisma.fulfillment.update({
  where: { id },
  data: {
    statusCurrent: shopifyStatus,
    statusCurrentUpdatedAt: new Date(),
    deliveredAt:
      shopifyStatus === ShopifyStatus.DELIVERED
        ? new Date()
        : fulfillment.deliveredAt,
  },
});
```

## Fehlerbehandlung

### Mögliche Fehler:

1. **Unauthorized** (401)
   - User nicht eingeloggt
   - User hat keinen Zugriff auf dieses Fulfillment

2. **Fulfillment not found** (404)
   - Fulfillment existiert nicht

3. **No tracking number** (400)
   - Fulfillment hat keine Tracking-Nummer

4. **17Track API Error** (400/500)
   - Tracking wurde von 17Track rejected
   - API Key ungültig
   - Rate Limit überschritten

5. **No status mapping** (500)
   - Keine Mapping-Regel für Track17 Status gefunden

6. **Shopify Update failed** (500)
   - Shopify API Fehler
   - Ungültige Credentials
   - Fulfillment existiert nicht in Shopify

## Logging

Der Flow verwendet umfangreiches Logging mit Emojis:

- 🔄 Manual Update Start
- 📡 17Track API Call
- 📥 17Track Response
- ✅ 17Track Success
- ❌ 17Track Error
- 🗺️ Mapping
- 🔍 Status Mapping Search
- ✅ Status Mapping Found
- ⚠️ Status Mapping Warning
- 🛒 Shopify Update
- ✅ Shopify Success
- ❌ Shopify Error
- 💾 Database Update
- ✅ Database Success

## Wichtige Hinweise

1. **Shopify Update hat Priorität** ⚠️ **KRITISCH**
   - Database wird NUR aktualisiert, wenn Shopify Update erfolgreich war
   - Dies stellt Konsistenz zwischen Shopify und Database sicher

   **Warum ist das Shopify Update kritisch?**

   Das Shopify Update ist kritisch, weil:

   a) **Shopify ist die Single Source of Truth**
   - Shopify ist die primäre Quelle für Fulfillment-Status
   - Kunden sehen den Status in ihrem Shopify Admin
   - Die Tracking-App ist nur ein Synchronisierungs-Tool

   b) **Vermeidung von Dateninkonsistenz**
   - Wenn Shopify Update fehlschlägt, aber Database aktualisiert wird:
     → Shopify zeigt: "In Transit"
     → Database zeigt: "Delivered"
     → Kunde sieht falschen Status in Shopify
     → App zeigt anderen Status als Shopify

   c) **Retry-Mechanismus**
   - Wenn Shopify fehlschlägt, wird Database NICHT aktualisiert
   - Beim nächsten manuellen Update oder Webhook wird der Status erneut versucht
   - Verhindert, dass fehlerhafte Updates "stecken bleiben"

   d) **Konsistenz mit Webhook-Flow**
   - Auch in automatischen Updates (via 17Track Webhooks) wird das gleiche Pattern verwendet
   - Database wird nur aktualisiert, wenn Shopify erfolgreich war
   - Siehe: `app/api/webhooks/trackings/route.ts` Zeile 340-368

   e) **Fehlerbehandlung**
   - Wenn Shopify Update fehlschlägt, wird sofort ein Fehler zurückgegeben
   - User erhält sofortiges Feedback über das Problem
   - Database bleibt im konsistenten Zustand

   **Code-Beispiel:**

   ```typescript
   try {
     // Shopify Update MUSS erfolgreich sein
     await shopifyService.updateFulfillmentStatus(...);
   } catch (shopifyError) {
     // Bei Fehler: Ganzes Update abbrechen
     return createErrorResponse('Failed to update Shopify', 500);
   }

   // Nur wenn Shopify erfolgreich war:
   await prisma.fulfillment.update({ ... }); // Database Update
   ```

2. **Status Mapping ist erforderlich**
   - Jeder Track17 Status muss auf einen Shopify Status gemappt sein
   - Mapping wird in `StatusMapping` Tabelle gespeichert

3. **Events werden sortiert**
   - Events werden nach Timestamp sortiert (neueste zuerst)
   - `lastEventAt` verwendet das neueste Event

4. **Nur für Running Trackings**
   - Button wird nur angezeigt, wenn `processStatus === 'Running'`
   - Gestoppte Trackings können mit PUT `/api/trackings/[id]` reaktiviert werden

## Unterschied zu automatischen Updates

**Automatische Updates (via Webhook):**

- Werden von 17Track ausgelöst
- Asynchron verarbeitet
- Können mehrere Trackings gleichzeitig betreffen

**Manuelle Updates:**

- Werden vom User ausgelöst
- Synchron verarbeitet
- Betreffen immer nur ein einzelnes Fulfillment
- Sofortiges Feedback an den User
