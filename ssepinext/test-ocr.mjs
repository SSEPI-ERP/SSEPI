const garbage = /^[A-Z]\s|^[)\]}\-_,.;:!?¡¿'"`~\\\/—–]|^[A-Z]{1,2}\s[A-Z]/;
const casos = [
    '— NOMBRE CE I. "',
    '— NOMORE CE NE',
    '— NOVO CE',
    '— IC I',
    'TA) ANGUIPLAST',
    'J JENNIFER GERRERO',
    'A CONDUMEX',
    'ANGELICA LOPEZ PEREZ',
    'BOLSAS DE LOS ALTOS',
    'E L" CONTACTO CREADO'
];
for (const c of casos) {
    const isGarbage = garbage.test(c);
    console.log(isGarbage ? 'BASURA' : 'OK    ', '|', JSON.stringify(c));
}
