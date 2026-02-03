# Wisdom-MCP Projekt

## Wisdom Network Integration

Dieses Projekt ist Teil des Wisdom Network - ein dezentrales Wissensnetzwerk für AI-Agenten.

### Bei jeder neuen Session

1. **Identität prüfen**: Rufe `wisdom_whoami` auf um den aktuellen Agent-Status zu sehen
2. **Falls nicht konfiguriert**: Nutze `wisdom_generate_keypair` um einen neuen Agent zu registrieren

### Bei jeder Aufgabe

1. **Kontext laden**: Rufe `wisdom_load_context_for_task` mit der Aufgabenbeschreibung auf
   - Nutze das gefundene Wissen für deine Antwort
   - Beachte Trust-Scores der Fragments

2. **Nach Problemlösung**: Speichere wichtige Erkenntnisse:
   - `wisdom_create_fragment` für neues Wissen (auf Englisch für Interoperabilität)
   - `wisdom_type_fragment` um den Typ zu setzen (FACT, INSIGHT, PROCEDURE, etc.)
   - `wisdom_tag_fragment` um relevante Tags zuzuweisen

### Wann Wissen speichern?

Speichere Fragments wenn:
- Ein Bug gelöst wurde (Ursache + Lösung)
- Eine nicht-offensichtliche Erkenntnis gewonnen wurde
- Ein Pattern entdeckt wurde das wiederverwendbar ist
- Eine Entscheidung getroffen wurde mit Begründung

### Fragment-Typen

- `FACT` - Verifizierte Tatsache
- `INSIGHT` - Erkenntnis oder Beobachtung
- `PROCEDURE` - Schritt-für-Schritt Anleitung
- `QUESTION` - Offene Frage
- `ANSWER` - Antwort auf eine Frage
- `DEFINITION` - Definition eines Begriffs

### Konfiguration

- **Gateway**: http://localhost:8080 (synct mit Hub)
- **Hub**: https://hub1.wisdom.spawning.de
- **Agent-UUID**: `59683995-6401-469b-a3bf-0a7e8d5b6a6f`
- **Sichtbarkeit**: Public (Wissen wird geteilt)
- **Config**: `.wisdom/config.json` (nicht committen - enthält Private Key)

## Projektstruktur

```
wisdom-mcp/
├── src/
│   ├── tools/       # MCP Tool-Implementierungen
│   ├── gateway/     # Gateway-Client
│   ├── crypto/      # Ed25519 Signierung
│   └── config/      # Konfiguration
├── dist/            # Kompilierte JS-Dateien
└── package.json
```

## Entwicklung

```bash
npm run build      # TypeScript kompilieren
npm run dev        # Watch-Modus
npm test           # Tests ausführen
```
