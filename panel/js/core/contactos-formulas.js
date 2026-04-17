// ================================================
// ARCHIVO: contactos-formulas.js
// DESCRIPCIÓN: Motor logístico para distancias y costos de recolección
// ================================================

export const ContactosFormulas = (function() {
    const PRECIO_GASOLINA = 24.50;
    const KM_POR_LITRO = 9.5;

    const KM_DATA = {
        "ANGUIPLAST": 234,
        "BOLSAS DE LOS ALTOS": 226,
        "ECOBOLSAS": 216,
        "BADER": 17.2,
        "BODYCOTE": 90.6,
        "COFICAB": 80,
        "CONDUMEX": 90.6,
        "ECSA": 32,
        "EMMSA": 21.6,
        "EPC 1": 400,
        "EPC 2": 402,
        "FRAENKISCHE": 79.4,
        "GEDNEY": 23.6,
        "GRUPO ACERERO": 386,
        "HALL ALUMINIUM": 73.8,
        "HIRUTA": 58.4,
        "IK PLASTIC": 61.4,
        "IMPRENTA JM": 16.2,
        "JARDIN LA ALEMANA": 12,
        "MAFLOW": 59.8,
        "MARQUARDT": 125.4,
        "MICROONDA": 41.6,
        "MR LUCKY": 157,
        "NHK SPRING MEXICO": 138.6,
        "NISHIKAWA": 61,
        "PIELES AZTECA": 5,
        "RONGTAI": 28.2,
        "SAFE DEMO": 61.6,
        "SERVIACERO ELECTROFORJADOS": 14.6,
        "SUACERO": 392,
        "TQ-1": 26,
        "MINO INDUSTRY": 29.2,
        "CURTIDOS BENGALA": 17.2
    };

    function normalizarNombre(nombre) {
        if (!nombre) return '';
        return nombre
            .toUpperCase()
            .replace(/S\.?A\.?/g, '')
            .replace(/C\.?V\.?/g, '')
            .replace(/DE C\.?V\.?/g, '')
            .replace(/S\.?DE\s+R\.?L\.?/g, '')
            .replace(/[^\w\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function getKmPorCliente(nombreCliente) {
        if (!nombreCliente) return 0;
        const norm = normalizarNombre(nombreCliente);
        for (let key in KM_DATA) {
            if (norm.includes(key) || key.includes(norm)) return KM_DATA[key];
        }
        for (let key in KM_DATA) {
            const normKey = normalizarNombre(key);
            if (norm.includes(normKey) || normKey.includes(norm)) return KM_DATA[key];
        }
        return 0;
    }

    function calcularCostoRecoleccion(km) {
        return km <= 0 ? 0 : (km / KM_POR_LITRO) * PRECIO_GASOLINA;
    }

    function calcularCostoRecoleccionRedondo(km) {
        return calcularCostoRecoleccion(km) * 2;
    }

    return {
        normalizarNombre,
        getKmPorCliente,
        calcularCostoRecoleccion,
        calcularCostoRecoleccionRedondo
    };
})();

window.ContactosFormulas = ContactosFormulas;