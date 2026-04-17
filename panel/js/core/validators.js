// ============================================================================
// validators.js - Validaciones globales
// ============================================================================

const Validators = {
    // Email
    isEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    },

    // RFC mexicano (básico, 12 o 13 caracteres)
    isRFC(rfc) {
        const re = /^[A-Z&Ñ]{3,4}[0-9]{6}[A-Z0-9]{3}$/;
        return re.test(rfc.toUpperCase());
    },

    // Teléfono (10 dígitos, opcional +52, guiones, espacios)
    isPhone(phone) {
        const cleaned = phone.replace(/\D/g, '');
        return cleaned.length === 10;
    },

    // Número positivo (incluye cero)
    isPositiveNumber(num) {
        return !isNaN(num) && num >= 0;
    },

    // Campo no vacío
    notEmpty(str) {
        return str && str.trim().length > 0;
    },

    // SKU (alfanumérico, guiones, entre 3 y 20 caracteres)
    isSKU(sku) {
        const re = /^[A-Z0-9-]{3,20}$/i;
        return re.test(sku);
    },

    // Fecha no futura
    isNotFutureDate(date) {
        const d = new Date(date);
        return d <= new Date();
    },

    // Validación completa de cliente
    validateCliente(cliente) {
        const errors = [];
        if (!this.notEmpty(cliente.nombre)) errors.push('Nombre es requerido');
        if (!this.isRFC(cliente.rfc)) errors.push('RFC inválido');
        if (cliente.contacto_email && !this.isEmail(cliente.contacto_email)) errors.push('Email de contacto inválido');
        if (cliente.contacto_telefono && !this.isPhone(cliente.contacto_telefono)) errors.push('Teléfono de contacto inválido');
        return { isValid: errors.length === 0, errors };
    },

    // Validación de cotización
    validateCotizacion(cotizacion) {
        const errors = [];
        if (!cotizacion.cliente_id) errors.push('Cliente es requerido');
        if (!this.isPositiveNumber(cotizacion.subtotal)) errors.push('Subtotal inválido');
        if (!this.isPositiveNumber(cotizacion.iva)) errors.push('IVA inválido');
        if (!this.isPositiveNumber(cotizacion.total)) errors.push('Total inválido');
        return { isValid: errors.length === 0, errors };
    }
};

window.Validators = Validators;