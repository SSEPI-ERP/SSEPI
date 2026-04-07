# CI y seguridad (SAST, SBOM)

## Scripts npm

- **`npm run audit`:** Ejecuta `npm audit`. Con dependencias en `package.json` y `package-lock.json`, reporta vulnerabilidades conocidas (CVEs). Sin lockfile, no hay dependencias que auditar.
- **`npm run sbom`:** Genera un archivo `sbom.json` mínimo (Bill of Materials). Cuando se añadan dependencias, se puede usar `npx @cyclonedx/cyclonedx-npm --output-file sbom.json` para un SBOM completo de npm.
- **`npm run serve`:** Arranca el servidor de desarrollo con cabeceras de seguridad en el puerto 8081.

## SAST (análisis estático)

- **ESLint + eslint-plugin-security:** Para analizar el código JavaScript en busca de patrones inseguros (eval, innerHTML, etc.):
  ```bash
  npm install -D eslint eslint-plugin-security
  npx eslint js/ --ext .js
  ```
- Integrar en CI: en cada push o PR, ejecutar `npm run audit` y `npm run lint` (cuando esté configurado ESLint).

## Ejemplo de flujo en GitHub Actions

```yaml
# .github/workflows/security.yml (opcional)
name: Security
on: [push, pull_request]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run audit
      - run: npm run sbom
      - run: npx eslint js/ --ext .js
```

## SBOM y dependencias

- Mantener `package-lock.json` en el repositorio cuando se añadan dependencias.
- Escanear periódicamente el SBOM o el lockfile con herramientas que detecten CVEs (npm audit, Snyk, etc.).
