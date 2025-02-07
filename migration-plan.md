# Migration Plan: Express Server zu Netlify Serverless Functions

## 1. Projektstruktur Änderungen

### Neue Verzeichnisstruktur
```
/
├── netlify/
│   └── functions/
│       ├── transcribe.ts     # Whisper API Funktion
│       └── instagram.ts      # Instagram Download Funktion
├── src/
│   ├── utils/
│   │   ├── openai.ts        # Angepasst für Netlify Function
│   │   └── instagram/
│   │       └── fetcher.ts   # Angepasst für Netlify Function
│   └── ...
└── netlify.toml             # Erweiterte Konfiguration
```

## 2. Implementierungsschritte

### 2.1 Netlify Functions Setup
1. Netlify Functions Verzeichnis erstellen
2. netlify.toml Konfiguration erweitern:
   - Funktions-Verzeichnis definieren
   - Umgebungsvariablen konfigurieren
   - Build-Einstellungen anpassen

### 2.2 Serverless Functions Implementation
1. Transcribe Function (`netlify/functions/transcribe.ts`):
   - Konvertierung des Express-Endpoints zu Serverless
   - Formidable durch native Netlify File-Handling ersetzen
   - OpenAI Integration beibehalten
   - CORS-Headers hinzufügen

2. Instagram Function (`netlify/functions/instagram.ts`):
   - RapidAPI Integration in Serverless Format
   - Error Handling anpassen
   - CORS-Headers hinzufügen

### 2.3 Frontend Anpassungen
1. API Endpoints aktualisieren:
   - `openai.ts`: Von `http://localhost:3001/api/transcribe` zu `/.netlify/functions/transcribe`
   - `fetcher.ts`: Von `http://localhost:3001/api/instagram` zu `/.netlify/functions/instagram`

2. Error Handling anpassen:
   - Response Format der Serverless Functions berücksichtigen
   - Neue Error Types für Serverless-spezifische Fehler

## 3. Notwendige Pakete

### Neue Dependencies
```json
{
  "dependencies": {
    "@netlify/functions": "^2.0.0",
    "@types/aws-lambda": "^8.10.0"
  }
}
```

## 4. Umgebungsvariablen

### Netlify UI Setup
1. Bestehende Umgebungsvariablen migrieren:
   - OPENAI_API_KEY
   - RAPID_API_KEY

## 5. Lokale Entwicklung

### Setup
1. Netlify CLI installieren:
   ```bash
   npm install -g netlify-cli
   ```

2. Lokale Entwicklungsumgebung:
   ```bash
   netlify dev
   ```

## 6. Deployment Schritte

1. Git Repository mit Netlify verbinden
2. Build-Einstellungen überprüfen:
   - Node.js Version: 20
   - Build Command: `npm run build`
   - Publish Directory: `dist`
3. Umgebungsvariablen in Netlify UI setzen
4. Deployment durchführen

## 7. Testing Plan

1. Lokales Testing:
   - Transcription Funktion
   - Instagram Download
   - Error Handling
   - File Upload Limits

2. Production Testing:
   - End-to-End Tests
   - Performance Monitoring
   - Error Logging

## 8. Rollback Plan

1. Git Branch für Express Version beibehalten
2. DNS Einstellungen dokumentieren
3. Backup der Umgebungsvariablen

## 9. Timeline

1. Setup & Konfiguration: 1 Tag
2. Functions Implementation: 2 Tage
3. Frontend Anpassungen: 1 Tag
4. Testing: 1 Tag
5. Deployment & Monitoring: 1 Tag

Geschätzte Gesamtdauer: 6 Arbeitstage