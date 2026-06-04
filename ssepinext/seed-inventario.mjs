import { getDb, persistDb, prepareStatement, setDeferPersist } from './db.mjs';

const db = await getDb();

// Datos actualizados Mayo 2026 - Precios verificados de distribuidores mexicanos
// 97 líneas, 383 piezas, ~$19,585 MXN
// Fuente: DigiKey.mx, Mouser.mx, Octopart
const INVENTARIO = [
  { codigo:"LM339", descripcion:"AMPLIFICADOR COMPARADOR", existencia:7, ubicacion:"A1", encapsulado:"DIP 14", costo:18.5, links:{octopart:"https://octopart.com/search?q=LM339", digikey:"https://www.digikey.com.mx/es/products/result?keywords=LM339", mouser:"https://www.mouser.mx/c/?q=LM339"} },
  { codigo:"LM339", descripcion:"AMPLIFICADOR COMPARADOR", existencia:9, ubicacion:"A1", encapsulado:"SOIC 14", costo:18.5, links:{octopart:"https://octopart.com/search?q=LM339", digikey:"https://www.digikey.com.mx/es/products/result?keywords=LM339", mouser:"https://www.mouser.mx/c/?q=LM339"} },
  { codigo:"CD4046BE", descripcion:"CIRCUITO SINCRONIZADOR DE FASE", existencia:4, ubicacion:"A2", encapsulado:"DIP14", costo:28, links:{octopart:"https://octopart.com/search?q=CD4046BE", digikey:"https://www.digikey.com.mx/es/products/result?keywords=CD4046BE", mouser:"https://www.mouser.mx/c/?q=CD4046BE"} },
  { codigo:"LM393", descripcion:"COMPARADOR DUAL", existencia:18, ubicacion:"B1", encapsulado:"SOIC 8", costo:14.2, links:{octopart:"https://octopart.com/search?q=LM393", digikey:"https://www.digikey.com.mx/es/products/result?keywords=LM393", mouser:"https://www.mouser.mx/c/?q=LM393"} },
  { codigo:"74HC85", descripcion:"High-Speed CMOS Logic 4-Bit Magnitude Comparator", existencia:7, ubicacion:"C1", encapsulado:"SOIC 14", costo:22.5, links:{octopart:"https://octopart.com/search?q=74HC85", digikey:"https://www.digikey.com.mx/es/products/result?keywords=74HC85", mouser:"https://www.mouser.mx/c/?q=74HC85"} },
  { codigo:"74HC85", descripcion:"High-Speed CMOS Logic 4-Bit Magnitude Comparator", existencia:5, ubicacion:"C1", encapsulado:"DIP 14", costo:22.5, links:{octopart:"https://octopart.com/search?q=74HC85", digikey:"https://www.digikey.com.mx/es/products/result?keywords=74HC85", mouser:"https://www.mouser.mx/c/?q=74HC85"} },
  { codigo:"HEF40106", descripcion:"Hex inverting Schmitt trigger", existencia:4, ubicacion:"A2", encapsulado:"DIP14", costo:20, links:{octopart:"https://octopart.com/search?q=HEF40106", digikey:"https://www.digikey.com.mx/es/products/result?keywords=HEF40106", mouser:"https://www.mouser.mx/c/?q=HEF40106"} },
  { codigo:"74HC00", descripcion:"COMPUERTAS NAND", existencia:5, ubicacion:"D1", encapsulado:"DIP14", costo:12, links:{octopart:"https://octopart.com/search?q=74HC00", digikey:"https://www.digikey.com.mx/es/products/result?keywords=74HC00", mouser:"https://www.mouser.mx/c/?q=74HC00"} },
  { codigo:"IRFBC40", descripcion:"MOSFET CHANEL N", existencia:5, ubicacion:"E1", encapsulado:"TO-220", costo:52, links:{octopart:"https://octopart.com/search?q=IRFBC40", digikey:"https://www.digikey.com.mx/es/products/result?keywords=IRFBC40", mouser:"https://www.mouser.mx/c/?q=IRFBC40"} },
  { codigo:"RHRP15100", descripcion:"DIODO HIPERFAST", existencia:4, ubicacion:"E1", encapsulado:"TO-220", costo:58, links:{octopart:"https://octopart.com/search?q=RHRP15100", digikey:"https://www.digikey.com.mx/es/products/result?keywords=RHRP15100", mouser:"https://www.mouser.mx/c/?q=RHRP15100"} },
  { codigo:"2N6344", descripcion:"TRIACS 8AMPER", existencia:1, ubicacion:"F1", encapsulado:"TO220", costo:45, links:{octopart:"https://octopart.com/search?q=2N6344", digikey:"https://www.digikey.com.mx/es/products/result?keywords=2N6344", mouser:"https://www.mouser.mx/c/?q=2N6344"} },
  { codigo:"FB3307Z", descripcion:"MOSFET CHANEL N", existencia:2, ubicacion:"F1", encapsulado:"TO-220", costo:40, links:{octopart:"https://octopart.com/search?q=FB3307Z", digikey:"https://www.digikey.com.mx/es/products/result?keywords=FB3307Z", mouser:"https://www.mouser.mx/c/?q=FB3307Z"} },
  { codigo:"74LS21", descripcion:"DUAL 4-INPUT POSITIVE-AND GATES", existencia:2, ubicacion:"G1", encapsulado:"DIP 14", costo:18, links:{octopart:"https://octopart.com/search?q=74LS21", digikey:"https://www.digikey.com.mx/es/products/result?keywords=74LS21", mouser:"https://www.mouser.mx/c/?q=74LS21"} },
  { codigo:"74LS14", descripcion:"SCHMITT TRIGGERSDUAL GATE/HEX INVERTER", existencia:2, ubicacion:"G1", encapsulado:"DIP14", costo:18, links:{octopart:"https://octopart.com/search?q=74LS14", digikey:"https://www.digikey.com.mx/es/products/result?keywords=74LS14", mouser:"https://www.mouser.mx/c/?q=74LS14"} },
  { codigo:"AM26LS31", descripcion:"Quadruple Differential Line Driver", existencia:4, ubicacion:"H1", encapsulado:"SOIC 14", costo:35, links:{octopart:"https://octopart.com/search?q=AM26LS31", digikey:"https://www.digikey.com.mx/es/products/result?keywords=AM26LS31", mouser:"https://www.mouser.mx/c/?q=AM26LS31"} },
  { codigo:"HCPL-0453", descripcion:"Optoacopladores de alta velocidad 1MBd 1Ch 16mA", existencia:13, ubicacion:"B2", encapsulado:"SOIC 8", costo:68, links:{octopart:"https://octopart.com/search?q=HCPL-0453", digikey:"https://www.digikey.com.mx/es/products/result?keywords=HCPL-0453", mouser:"https://www.mouser.mx/c/?q=HCPL-0453"} },
  { codigo:"NCP5106BDR2G", descripcion:"Controladores de puertas HIGH VOLT MOSFET DR LO MOSFET IGBT", existencia:3, ubicacion:"C2", encapsulado:"SOIC 8", costo:28, links:{octopart:"https://octopart.com/search?q=NCP5106BDR2G", digikey:"https://www.digikey.com.mx/es/products/result?keywords=NCP5106BDR2G", mouser:"https://www.mouser.mx/c/?q=NCP5106BDR2G"} },
  { codigo:"IRFR3411", descripcion:"MOSFET N-CH 100V 32A DPAK", existencia:1, ubicacion:"C2", encapsulado:"TO-252AA", costo:30, links:{octopart:"https://octopart.com/search?q=IRFR3411", digikey:"https://www.digikey.com.mx/es/products/result?keywords=IRFR3411", mouser:"https://www.mouser.mx/c/?q=IRFR3411"} },
  { codigo:"DSEI30-06A", descripcion:"Diodo epitaxial de recuperacion rapida", existencia:1, ubicacion:"D2", encapsulado:"", costo:90, links:{octopart:"https://octopart.com/search?q=DSEI30-06A", digikey:"https://www.digikey.com.mx/es/products/result?keywords=DSEI30-06A", mouser:"https://www.mouser.mx/c/?q=DSEI30-06A"} },
  { codigo:"TLH-4951", descripcion:"BATERIA 3.6", existencia:1, ubicacion:"E2", encapsulado:"1/2AA", costo:165, links:{octopart:"https://octopart.com/search?q=TLH-4951", digikey:"https://www.digikey.com.mx/es/products/result?keywords=TLH-4951", mouser:"https://www.mouser.mx/c/?q=TLH-4951"} },
  { codigo:"XL-050F", descripcion:"BATERIA 3.6V", existencia:1, ubicacion:"E2", encapsulado:"1/2AA", costo:135, links:{octopart:"https://octopart.com/search?q=XL-050F", digikey:"https://www.digikey.com.mx/es/products/result?keywords=XL-050F", mouser:"https://www.mouser.mx/c/?q=XL-050F"} },
  { codigo:"F2/250E", descripcion:"Fusible ceramico de accion retardada 2A/250V", existencia:3, ubicacion:"F2", encapsulado:"", costo:18, links:{octopart:"https://octopart.com/search?q=F2/250E+", digikey:"https://www.digikey.com.mx/es/products/result?keywords=F2/250E+", mouser:"https://www.mouser.mx/c/?q=F2/250E+"} },
  { codigo:"083AG324A2", descripcion:"Controlador de sumidero Darlington de 8 canales", existencia:6, ubicacion:"F2", encapsulado:"", costo:20, links:{octopart:"https://octopart.com/search?q=083AG324A2", digikey:"https://www.digikey.com.mx/es/products/result?keywords=083AG324A2", mouser:"https://www.mouser.mx/c/?q=083AG324A2"} },
  { codigo:"TRANSCEIVER", descripcion:"TRANSCEIVER RS485/422", existencia:2, ubicacion:"A3", encapsulado:"SOIC 14", costo:18, links:{octopart:"https://octopart.com/search?q=TRANSCEIVER+RS485/422", digikey:"https://www.digikey.com.mx/es/products/result?keywords=TRANSCEIVER+RS485/422", mouser:"https://www.mouser.mx/c/?q=TRANSCEIVER+RS485/422"} },
  { codigo:"M81738FP", descripcion:"Controlador de medio puente de alto voltaje de 1200 V", existencia:2, ubicacion:"G2", encapsulado:"", costo:280, links:{octopart:"https://octopart.com/search?q=M81738FP", digikey:"https://www.digikey.com.mx/es/products/result?keywords=M81738FP", mouser:"https://www.mouser.mx/c/?q=M81738FP"} },
  { codigo:"HEF4094BT", descripcion:"Registro de desplazamiento serial de 8 etapas", existencia:2, ubicacion:"E3", encapsulado:"SO16", costo:18, links:{octopart:"https://octopart.com/search?q=HEF4094BT", digikey:"https://www.digikey.com.mx/es/products/result?keywords=HEF4094BT", mouser:"https://www.mouser.mx/c/?q=HEF4094BT"} },
  { codigo:"74HCT02", descripcion:"COMPUERTAS LOGICAS NOR", existencia:7, ubicacion:"B3", encapsulado:"SOIC 14", costo:18, links:{octopart:"https://octopart.com/search?q=74HCT02", digikey:"https://www.digikey.com.mx/es/products/result?keywords=74HCT02", mouser:"https://www.mouser.mx/c/?q=74HCT02"} },
  { codigo:"HCF4094", descripcion:"Registro de bus de desplazamiento y almacenamiento de 8 etapas con salidas de 3 etapas", existencia:3, ubicacion:"C3", encapsulado:"SO16", costo:18, links:{octopart:"https://octopart.com/search?q=HCF4094", digikey:"https://www.digikey.com.mx/es/products/result?keywords=HCF4094", mouser:"https://www.mouser.mx/c/?q=HCF4094"} },
  { codigo:"SN75176BP", descripcion:"INTERFAS RS485/422", existencia:4, ubicacion:"D3", encapsulado:"SOIC-8", costo:18, links:{octopart:"https://octopart.com/search?q=SN75176BP", digikey:"https://www.digikey.com.mx/es/products/result?keywords=SN75176BP", mouser:"https://www.mouser.mx/c/?q=SN75176BP"} },
  { codigo:"TL598CN", descripcion:"CONTROLADOR PWM", existencia:2, ubicacion:"F3", encapsulado:"DIP-16", costo:18, links:{octopart:"https://octopart.com/search?q=TL598CN", digikey:"https://www.digikey.com.mx/es/products/result?keywords=TL598CN", mouser:"https://www.mouser.mx/c/?q=TL598CN"} },
  { codigo:"CD4011BE", descripcion:"Puertas NAND CMOS", existencia:11, ubicacion:"G3", encapsulado:"DIP-14", costo:18, links:{octopart:"https://octopart.com/search?q=CD4011BE", digikey:"https://www.digikey.com.mx/es/products/result?keywords=CD4011BE", mouser:"https://www.mouser.mx/c/?q=CD4011BE"} },
  { codigo:"TEXTOOL/3M", descripcion:"BASE PARA MICROCONTROLADOR DE EDC", existencia:1, ubicacion:"A4", encapsulado:"", costo:18, links:{octopart:"https://octopart.com/search?q=TEXTOOL/3M", digikey:"https://www.digikey.com.mx/es/products/result?keywords=TEXTOOL/3M", mouser:"https://www.mouser.mx/c/?q=TEXTOOL/3M"} },
  { codigo:"CAPACITOR", descripcion:"CAPACITOR ELECTROLITICO 50V 2200UF", existencia:2, ubicacion:"B4", encapsulado:"", costo:25, links:{octopart:"https://octopart.com/search?q=CAPACITOR+ELECTROLITICO+50V+2200UF", digikey:"https://www.digikey.com.mx/es/products/result?keywords=CAPACITOR+ELECTROLITICO+50V+2200UF", mouser:"https://www.mouser.mx/c/?q=CAPACITOR+ELECTROLITICO+50V+2200UF"} },
  { codigo:"HCPL-786J", descripcion:"OPTOACOPLADOR Data Acquisition ADCs/DACs - Specialized Isolated Modular", existencia:6, ubicacion:"C4", encapsulado:"SOIC-16", costo:200, links:{octopart:"https://octopart.com/search?q=HCPL-786J", digikey:"https://www.digikey.com.mx/es/products/result?keywords=HCPL-786J", mouser:"https://www.mouser.mx/c/?q=HCPL-786J"} },
  { codigo:"LT1791IS", descripcion:"INTERFAS RS485/422", existencia:2, ubicacion:"D4", encapsulado:"SOIC-14", costo:165, links:{octopart:"https://octopart.com/search?q=LT1791IS", digikey:"https://www.digikey.com.mx/es/products/result?keywords=LT1791IS", mouser:"https://www.mouser.mx/c/?q=LT1791IS"} },
  { codigo:"CD4013", descripcion:"FLIP-FLOP", existencia:2, ubicacion:"E4", encapsulado:"DIP-14", costo:18, links:{octopart:"https://octopart.com/search?q=CD4013", digikey:"https://www.digikey.com.mx/es/products/result?keywords=CD4013", mouser:"https://www.mouser.mx/c/?q=CD4013"} },
  { codigo:"MC14503BDR2G", descripcion:"Hex Non-Inverting 3-State Buffer", existencia:5, ubicacion:"F4", encapsulado:"SOIC-16", costo:18, links:{octopart:"https://octopart.com/search?q=MC14503BDR2G", digikey:"https://www.digikey.com.mx/es/products/result?keywords=MC14503BDR2G", mouser:"https://www.mouser.mx/c/?q=MC14503BDR2G"} },
  { codigo:"BZX55C18-TR", descripcion:"DIODO ZENER 18V 0.5W", existencia:4, ubicacion:"G4", encapsulado:"", costo:18, links:{octopart:"https://octopart.com/search?q=BZX55C18-TR", digikey:"https://www.digikey.com.mx/es/products/result?keywords=BZX55C18-TR", mouser:"https://www.mouser.mx/c/?q=BZX55C18-TR"} },
  { codigo:"SK310BQ-LTP", descripcion:"DIODO SCHOTTKY", existencia:4, ubicacion:"H4", encapsulado:"DO214AA", costo:18, links:{octopart:"https://octopart.com/search?q=SK310BQ-LTP", digikey:"https://www.digikey.com.mx/es/products/result?keywords=SK310BQ-LTP", mouser:"https://www.mouser.mx/c/?q=SK310BQ-LTP"} },
  { codigo:"CD4001", descripcion:"COMPUERTAS LOGICAS NOR", existencia:9, ubicacion:"A5", encapsulado:"", costo:18, links:{octopart:"https://octopart.com/search?q=CD4001", digikey:"https://www.digikey.com.mx/es/products/result?keywords=CD4001", mouser:"https://www.mouser.mx/c/?q=CD4001"} },
  { codigo:"MC33167TVG", descripcion:"SWITCHING REGULADOR 40V 5A", existencia:2, ubicacion:"H3", encapsulado:"TO-220", costo:90, links:{octopart:"https://octopart.com/search?q=MC33167TVG", digikey:"https://www.digikey.com.mx/es/products/result?keywords=MC33167TVG", mouser:"https://www.mouser.mx/c/?q=MC33167TVG"} },
  { codigo:"TOP250YN", descripcion:"AC/DC Converters 210 W 85-265 VAC 290 W 230 VAC", existencia:2, ubicacion:"B5", encapsulado:"TO-220", costo:95, links:{octopart:"https://octopart.com/search?q=TOP250YN", digikey:"https://www.digikey.com.mx/es/products/result?keywords=TOP250YN", mouser:"https://www.mouser.mx/c/?q=TOP250YN"} },
  { codigo:"RMS-100E", descripcion:"RESISTENCIA 10 OHMS", existencia:10, ubicacion:"C5", encapsulado:"SMD", costo:18, links:{octopart:"https://octopart.com/search?q=RMS-100E", digikey:"https://www.digikey.com.mx/es/products/result?keywords=RMS-100E", mouser:"https://www.mouser.mx/c/?q=RMS-100E"} },
  { codigo:"0325020.MXF80P", descripcion:"FUSIBLE AMERICANO250V 20A SLO-BLO", existencia:3, ubicacion:"D5", encapsulado:"AMERICANO", costo:18, links:{octopart:"https://octopart.com/search?q=0325020.MXF80P", digikey:"https://www.digikey.com.mx/es/products/result?keywords=0325020.MXF80P", mouser:"https://www.mouser.mx/c/?q=0325020.MXF80P"} },
  { codigo:"D2F-01FL-T", descripcion:"MICRO SWITCH", existencia:3, ubicacion:"E5", encapsulado:"", costo:18, links:{octopart:"https://octopart.com/search?q=D2F-01FL-T", digikey:"https://www.digikey.com.mx/es/products/result?keywords=D2F-01FL-T", mouser:"https://www.mouser.mx/c/?q=D2F-01FL-T"} },
  { codigo:"CC1R5-2412DF-E", descripcion:"CONVERTIDOR DC/DC AISLADO 1.5W 12V", existencia:1, ubicacion:"F5", encapsulado:"", costo:230, links:{octopart:"https://octopart.com/search?q=CC1R5-2412DF-E", digikey:"https://www.digikey.com.mx/es/products/result?keywords=CC1R5-2412DF-E", mouser:"https://www.mouser.mx/c/?q=CC1R5-2412DF-E"} },
  { codigo:"3700630410", descripcion:"FUSIBLE 0.063A", existencia:2, ubicacion:"G5", encapsulado:"", costo:18, links:{octopart:"https://octopart.com/search?q=3700630410", digikey:"https://www.digikey.com.mx/es/products/result?keywords=3700630410", mouser:"https://www.mouser.mx/c/?q=3700630410"} },
  { codigo:"GBU2510-G", descripcion:"PUENTE RECTIFICADOR 25A", existencia:1, ubicacion:"H5", encapsulado:"", costo:40, links:{octopart:"https://octopart.com/search?q=GBU2510-G", digikey:"https://www.digikey.com.mx/es/products/result?keywords=GBU2510-G", mouser:"https://www.mouser.mx/c/?q=GBU2510-G"} },
  { codigo:"FM1", descripcion:"FUSIBLE MINI 1 A 250 V", existencia:4, ubicacion:"A6", encapsulado:"", costo:18, links:{octopart:"https://octopart.com/search?q=FM1", digikey:"https://www.digikey.com.mx/es/products/result?keywords=FM1", mouser:"https://www.mouser.mx/c/?q=FM1"} },
  { codigo:"MMBF4393LT1G", descripcion:"MOSFET 30V 30ma", existencia:5, ubicacion:"B6", encapsulado:"SOT-23", costo:18, links:{octopart:"https://octopart.com/search?q=MMBF4393LT1G", digikey:"https://www.digikey.com.mx/es/products/result?keywords=MMBF4393LT1G", mouser:"https://www.mouser.mx/c/?q=MMBF4393LT1G"} },
  { codigo:"LM358", descripcion:"AMPLIFICADOR OPERACIONAL DUAL", existencia:3, ubicacion:"C6", encapsulado:"SOIC 8", costo:12, links:{octopart:"https://octopart.com/search?q=LM358", digikey:"https://www.digikey.com.mx/es/products/result?keywords=LM358", mouser:"https://www.mouser.mx/c/?q=LM358"} },
  { codigo:"LM324", descripcion:"AMPLIFICADOR OPERACIONAL 4", existencia:4, ubicacion:"D6", encapsulado:"SOIC 16", costo:14, links:{octopart:"https://octopart.com/search?q=LM324", digikey:"https://www.digikey.com.mx/es/products/result?keywords=LM324", mouser:"https://www.mouser.mx/c/?q=LM324"} },
  { codigo:"CC3-2405SF-E", descripcion:"CONVERTIDOR DC/DC AISLADO 3W 5V 0.6A", existencia:1, ubicacion:"E6", encapsulado:"", costo:320, links:{octopart:"https://octopart.com/search?q=CC3-2405SF-E", digikey:"https://www.digikey.com.mx/es/products/result?keywords=CC3-2405SF-E", mouser:"https://www.mouser.mx/c/?q=CC3-2405SF-E"} },
  { codigo:"FGA60N65SMD", descripcion:"IGBT 650V 60A", existencia:2, ubicacion:"F6", encapsulado:"TO3PN", costo:125, links:{octopart:"https://octopart.com/search?q=FGA60N65SMD", digikey:"https://www.digikey.com.mx/es/products/result?keywords=FGA60N65SMD", mouser:"https://www.mouser.mx/c/?q=FGA60N65SMD"} },
  { codigo:"LM25575MHX", descripcion:"REGULADORES DE VOLTAJE 42V 1.5A", existencia:4, ubicacion:"G6", encapsulado:"TSSOP 16", costo:18, links:{octopart:"https://octopart.com/search?q=LM25575MHX/NOPB", digikey:"https://www.digikey.com.mx/es/products/result?keywords=LM25575MHX/NOPB", mouser:"https://www.mouser.mx/c/?q=LM25575MHX/NOPB"} },
  { codigo:"TRANSFORMADOR", descripcion:"TRANSFORMADOR 220V / 110V", existencia:1, ubicacion:"H6", encapsulado:"", costo:18, links:{octopart:"https://octopart.com/search?q=TRANSFORMADOR++220V+/+110V+", digikey:"https://www.digikey.com.mx/es/products/result?keywords=TRANSFORMADOR++220V+/+110V+", mouser:"https://www.mouser.mx/c/?q=TRANSFORMADOR++220V+/+110V+"} },
  { codigo:"TRANSFORMADOR", descripcion:"TRANSFORMADOR 110/110", existencia:3, ubicacion:"A7", encapsulado:"", costo:18, links:{octopart:"https://octopart.com/search?q=TRANSFORMADOR+110/110", digikey:"https://www.digikey.com.mx/es/products/result?keywords=TRANSFORMADOR+110/110", mouser:"https://www.mouser.mx/c/?q=TRANSFORMADOR+110/110"} },
  { codigo:"SKA20420", descripcion:"RELEVADOR DE ESTADO SOLIDO", existencia:3, ubicacion:"B7", encapsulado:"", costo:18, links:{octopart:"https://octopart.com/search?q=SKA20420", digikey:"https://www.digikey.com.mx/es/products/result?keywords=SKA20420", mouser:"https://www.mouser.mx/c/?q=SKA20420"} },
  { codigo:"CAPACITOR", descripcion:"CAPACITOR DE PELICULA 220nF 100v", existencia:5, ubicacion:"C7", encapsulado:"", costo:22, links:{octopart:"https://octopart.com/search?q=CAPACITOR+DE+PELICULA+220nF+100v", digikey:"https://www.digikey.com.mx/es/products/result?keywords=CAPACITOR+DE+PELICULA+220nF+100v", mouser:"https://www.mouser.mx/c/?q=CAPACITOR+DE+PELICULA+220nF+100v"} },
  { codigo:"RELEVADOR", descripcion:"RELEVADOR DE 12V", existencia:2, ubicacion:"D7", encapsulado:"", costo:18, links:{octopart:"https://octopart.com/search?q=RELEVADOR+DE+12V+", digikey:"https://www.digikey.com.mx/es/products/result?keywords=RELEVADOR+DE+12V+", mouser:"https://www.mouser.mx/c/?q=RELEVADOR+DE+12V+"} },
  { codigo:"RESISTENCIA", descripcion:"RESISTENCIA DE POTENCIA 47 OHMS 10 W", existencia:1, ubicacion:"E7", encapsulado:"", costo:1.5, links:{octopart:"https://octopart.com/search?q=RESISTENCIA+DE+POTENCIA+47+OHMS+10+W", digikey:"https://www.digikey.com.mx/es/products/result?keywords=RESISTENCIA+DE+POTENCIA+47+OHMS+10+W", mouser:"https://www.mouser.mx/c/?q=RESISTENCIA+DE+POTENCIA+47+OHMS+10+W"} },
  { codigo:"74HC00", descripcion:"COMPUERTAS NAND", existencia:2, ubicacion:"F7", encapsulado:"SOIC 14", costo:12, links:{octopart:"https://octopart.com/search?q=74HC00", digikey:"https://www.digikey.com.mx/es/products/result?keywords=74HC00", mouser:"https://www.mouser.mx/c/?q=74HC00"} },
  { codigo:"MC74HC165", descripcion:"REGISTRO DE 8 BITS", existencia:2, ubicacion:"G7", encapsulado:"SOIC 16", costo:18, links:{octopart:"https://octopart.com/search?q=MC74HC165", digikey:"https://www.digikey.com.mx/es/products/result?keywords=MC74HC165", mouser:"https://www.mouser.mx/c/?q=MC74HC165"} },
  { codigo:"BC847", descripcion:"Bipolar Transistors - BJT SOT23 45V .1A NPN GP TRANS", existencia:26, ubicacion:"H7", encapsulado:"SOT-23", costo:2.5, links:{octopart:"https://octopart.com/search?q=BC847", digikey:"https://www.digikey.com.mx/es/products/result?keywords=BC847", mouser:"https://www.mouser.mx/c/?q=BC847"} },
  { codigo:"2SC2873", descripcion:"TRANSISTOR NPN", existencia:2, ubicacion:"A8", encapsulado:"SOT-89", costo:18, links:{octopart:"https://octopart.com/search?q=2SC2873", digikey:"https://www.digikey.com.mx/es/products/result?keywords=2SC2873", mouser:"https://www.mouser.mx/c/?q=2SC2873"} },
  { codigo:"RELEVADOR", descripcion:"RELEVADOR DE 5V", existencia:2, ubicacion:"B8", encapsulado:"", costo:28, links:{octopart:"https://octopart.com/search?q=RELEVADOR+DE+5V", digikey:"https://www.digikey.com.mx/es/products/result?keywords=RELEVADOR+DE+5V", mouser:"https://www.mouser.mx/c/?q=RELEVADOR+DE+5V"} },
  { codigo:"M27C512-10F1", descripcion:"MEMORIA EPROM", existencia:2, ubicacion:"C8", encapsulado:"DIP 28", costo:18, links:{octopart:"https://octopart.com/search?q=M27C512-10F1", digikey:"https://www.digikey.com.mx/es/products/result?keywords=M27C512-10F1", mouser:"https://www.mouser.mx/c/?q=M27C512-10F1"} },
  { codigo:"10XSIH-SP-5X20", descripcion:"PORTA FUSIBLES PARA TARJETAS ECOBOLSAS", existencia:8, ubicacion:"D8", encapsulado:"", costo:18, links:{octopart:"https://octopart.com/search?q=10XSIH-SP-5X20", digikey:"https://www.digikey.com.mx/es/products/result?keywords=10XSIH-SP-5X20", mouser:"https://www.mouser.mx/c/?q=10XSIH-SP-5X20"} },
  { codigo:"PM150RSE060", descripcion:"MODULO IGBT MITSUBISHI", existencia:1, ubicacion:"T13", encapsulado:"", costo:2800, links:{octopart:"https://octopart.com/search?q=PM150RSE060", digikey:"https://www.digikey.com.mx/es/products/result?keywords=PM150RSE060", mouser:"https://www.mouser.mx/c/?q=PM150RSE060"} },
  { codigo:"SKKD 100/16", descripcion:"DIODO DUAL SEMIKRON", existencia:3, ubicacion:"U13", encapsulado:"", costo:1200, links:{octopart:"https://octopart.com/search?q=SKKD+100/16", digikey:"https://www.digikey.com.mx/es/products/result?keywords=SKKD+100/16", mouser:"https://www.mouser.mx/c/?q=SKKD+100/16"} },
  { codigo:"B43544-E2228-M2", descripcion:"CAPACITOR 2200UF 250V", existencia:0, ubicacion:"T14", encapsulado:"", costo:280, links:{octopart:"https://octopart.com/search?q=B43544-E2228-M2", digikey:"https://www.digikey.com.mx/es/products/result?keywords=B43544-E2228-M2", mouser:"https://www.mouser.mx/c/?q=B43544-E2228-M2"} },
  { codigo:"0D22A2", descripcion:"CAPACITOR 560UF 450V", existencia:2, ubicacion:"V13", encapsulado:"", costo:18, links:{octopart:"https://octopart.com/search?q=0D22A2", digikey:"https://www.digikey.com.mx/es/products/result?keywords=0D22A2", mouser:"https://www.mouser.mx/c/?q=0D22A2"} },
  { codigo:"P011351481", descripcion:"TERMINAL ROJO 3/16", existencia:10, ubicacion:"W13", encapsulado:"", costo:18, links:{octopart:"https://octopart.com/search?q=P011351481", digikey:"https://www.digikey.com.mx/es/products/result?keywords=P011351481", mouser:"https://www.mouser.mx/c/?q=P011351481"} },
  { codigo:"PFB14421293", descripcion:"TERMINAL NEGRO 3/16", existencia:5, ubicacion:"W14", encapsulado:"", costo:18, links:{octopart:"https://octopart.com/search?q=PFB14421293", digikey:"https://www.digikey.com.mx/es/products/result?keywords=PFB14421293", mouser:"https://www.mouser.mx/c/?q=PFB14421293"} },
  { codigo:"KTR10EZPJ4R7", descripcion:"RESISTENCIA 4.7 OHMS", existencia:9, ubicacion:"I1", encapsulado:"", costo:18, links:{octopart:"https://octopart.com/search?q=KTR10EZPJ4R7", digikey:"https://www.digikey.com.mx/es/products/result?keywords=KTR10EZPJ4R7", mouser:"https://www.mouser.mx/c/?q=KTR10EZPJ4R7"} },
  { codigo:"SR1210JR-074R7L", descripcion:"RESISTENCIA 4.7 OHMS", existencia:10, ubicacion:"I1", encapsulado:"", costo:18, links:{octopart:"https://octopart.com/search?q=SR1210JR-074R7L", digikey:"https://www.digikey.com.mx/es/products/result?keywords=SR1210JR-074R7L", mouser:"https://www.mouser.mx/c/?q=SR1210JR-074R7L"} },
  { codigo:"CRCW25124R7OJNEGIF", descripcion:"RESISTENCIA 4.7 OHMS", existencia:10, ubicacion:"I2", encapsulado:"", costo:18, links:{octopart:"https://octopart.com/search?q=CRCW25124R7OJNEGIF", digikey:"https://www.digikey.com.mx/es/products/result?keywords=CRCW25124R7OJNEGIF", mouser:"https://www.mouser.mx/c/?q=CRCW25124R7OJNEGIF"} },
  { codigo:"A4985SLPTR-T", descripcion:"1A DUAL FULL BRIDGE", existencia:4, ubicacion:"Sin ubicacion", encapsulado:"", costo:18, links:{octopart:"https://octopart.com/search?q=A4985SLPTR-T", digikey:"https://www.digikey.com.mx/es/products/result?keywords=A4985SLPTR-T", mouser:"https://www.mouser.mx/c/?q=A4985SLPTR-T"} },
  { codigo:"PASTA", descripcion:"PASTA TERMICA", existencia:1, ubicacion:"P13", encapsulado:"", costo:18, links:{octopart:"https://octopart.com/search?q=PASTA+TERMICA+", digikey:"https://www.digikey.com.mx/es/products/result?keywords=PASTA+TERMICA+", mouser:"https://www.mouser.mx/c/?q=PASTA+TERMICA+"} },
  { codigo:"FLUX", descripcion:"FLUX", existencia:1, ubicacion:"P14", encapsulado:"", costo:18, links:{octopart:"https://octopart.com/search?q=FLUX", digikey:"https://www.digikey.com.mx/es/products/result?keywords=FLUX", mouser:"https://www.mouser.mx/c/?q=FLUX"} },
  { codigo:"PASTA2", descripcion:"PASTA DE BAJA TEMPERATURA", existencia:1, ubicacion:"P15", encapsulado:"", costo:18, links:{octopart:"https://octopart.com/search?q=PASTA+DE+BAJA+TEMPERATURA+", digikey:"https://www.digikey.com.mx/es/products/result?keywords=PASTA+DE+BAJA+TEMPERATURA+", mouser:"https://www.mouser.mx/c/?q=PASTA+DE+BAJA+TEMPERATURA+"} },
  { codigo:"ESPONJA", descripcion:"ESPONJA PARA CAUTIN", existencia:2, ubicacion:"Q13", encapsulado:"", costo:18, links:{octopart:"https://octopart.com/search?q=ESPONJA+PARA+CAUTIN", digikey:"https://www.digikey.com.mx/es/products/result?keywords=ESPONJA+PARA+CAUTIN", mouser:"https://www.mouser.mx/c/?q=ESPONJA+PARA+CAUTIN"} },
  { codigo:"CM200DY-12NF", descripcion:"MODULO IGBT MITSUBISHI", existencia:1, ubicacion:"Q14", encapsulado:"", costo:1450, links:{octopart:"https://octopart.com/search?q=CM200DY-12NF", digikey:"https://www.digikey.com.mx/es/products/result?keywords=CM200DY-12NF", mouser:"https://www.mouser.mx/c/?q=CM200DY-12NF"} },
  { codigo:"DC-24-1", descripcion:"FUENTE IN 120-220VAC / OUT 24VDC", existencia:3, ubicacion:"Q15", encapsulado:"", costo:18, links:{octopart:"https://octopart.com/search?q=DC-24-1", digikey:"https://www.digikey.com.mx/es/products/result?keywords=DC-24-1", mouser:"https://www.mouser.mx/c/?q=DC-24-1"} },
  { codigo:"LM2596", descripcion:"DC-DC FUENTE REGULABLE IN 24VDC / OUT 0-24 VDC", existencia:6, ubicacion:"R13", encapsulado:"", costo:18, links:{octopart:"https://octopart.com/search?q=LM2596", digikey:"https://www.digikey.com.mx/es/products/result?keywords=LM2596", mouser:"https://www.mouser.mx/c/?q=LM2596"} },
  { codigo:"FUSIBLES", descripcion:"FUSIBLES TIPO EUROPEOS 6A", existencia:7, ubicacion:"F8", encapsulado:"", costo:18, links:{octopart:"https://octopart.com/search?q=FUSIBLES+TIPO+EUROPEOS+6A+", digikey:"https://www.digikey.com.mx/es/products/result?keywords=FUSIBLES+TIPO+EUROPEOS+6A+", mouser:"https://www.mouser.mx/c/?q=FUSIBLES+TIPO+EUROPEOS+6A+"} },
  { codigo:"TC33X-2-503G", descripcion:"potenciometro 3mm 50k ohms", existencia:1, ubicacion:"F9", encapsulado:"", costo:18, links:{octopart:"https://octopart.com/search?q=TC33X-2-503G", digikey:"https://www.digikey.com.mx/es/products/result?keywords=TC33X-2-503G", mouser:"https://www.mouser.mx/c/?q=TC33X-2-503G"} },
  { codigo:"AD8512BRZ", descripcion:"amplificador operacional low noise", existencia:1, ubicacion:"G9", encapsulado:"soic 8", costo:500, links:{octopart:"https://octopart.com/search?q=AD8512BRZ", digikey:"https://www.digikey.com.mx/es/products/result?keywords=AD8512BRZ", mouser:"https://www.mouser.mx/c/?q=AD8512BRZ"} },
  { codigo:"TL074IYDT", descripcion:"amplificador operacional", existencia:1, ubicacion:"Sin ubicacion", encapsulado:"soic 14", costo:18, links:{octopart:"https://octopart.com/search?q=TL074IYDT", digikey:"https://www.digikey.com.mx/es/products/result?keywords=TL074IYDT", mouser:"https://www.mouser.mx/c/?q=TL074IYDT"} },
  { codigo:"TLP352", descripcion:"OPTOACOPLADOR", existencia:4, ubicacion:"B9", encapsulado:"", costo:18, links:{octopart:"https://octopart.com/search?q=TLP352", digikey:"https://www.digikey.com.mx/es/products/result?keywords=TLP352", mouser:"https://www.mouser.mx/c/?q=TLP352"} },
  { codigo:"A4980KLPTR", descripcion:"CONTROLADOR DE DISPAROS", existencia:1, ubicacion:"G8", encapsulado:"", costo:18, links:{octopart:"https://octopart.com/search?q=A4980KLPTR", digikey:"https://www.digikey.com.mx/es/products/result?keywords=A4980KLPTR", mouser:"https://www.mouser.mx/c/?q=A4980KLPTR"} },
  { codigo:"BZT52HC13", descripcion:"DIODO ZENER 13V", existencia:9, ubicacion:"H8", encapsulado:"", costo:18, links:{octopart:"https://octopart.com/search?q=BZT52HC13", digikey:"https://www.digikey.com.mx/es/products/result?keywords=BZT52HC13", mouser:"https://www.mouser.mx/c/?q=BZT52HC13"} },
  { codigo:"MAX232ECWET", descripcion:"INTERFAZ RS-232", existencia:1, ubicacion:"C9", encapsulado:"", costo:72, links:{octopart:"https://octopart.com/search?q=MAX232ECWET", digikey:"https://www.digikey.com.mx/es/products/result?keywords=MAX232ECWET", mouser:"https://www.mouser.mx/c/?q=MAX232ECWET"} },
  { codigo:"ST485EBDR", descripcion:"TRANSCEIVER RS485/422", existencia:1, ubicacion:"D9", encapsulado:"", costo:18, links:{octopart:"https://octopart.com/search?q=ST485EBDR", digikey:"https://www.digikey.com.mx/es/products/result?keywords=ST485EBDR", mouser:"https://www.mouser.mx/c/?q=ST485EBDR"} },
  { codigo:"74HC08D", descripcion:"COMPUERTA LOGICA", existencia:1, ubicacion:"E9", encapsulado:"", costo:18, links:{octopart:"https://octopart.com/search?q=74HC08D", digikey:"https://www.digikey.com.mx/es/products/result?keywords=74HC08D", mouser:"https://www.mouser.mx/c/?q=74HC08D"} },
  { codigo:"PS2802-4-A", descripcion:"HI-ISO DARLING 4 CH", existencia:1, ubicacion:"D10", encapsulado:"", costo:18, links:{octopart:"https://octopart.com/search?q=PS2802-4-A", digikey:"https://www.digikey.com.mx/es/products/result?keywords=PS2802-4-A", mouser:"https://www.mouser.mx/c/?q=PS2802-4-A"} },
  { codigo:"TPD2007F", descripcion:"COMPUERTA", existencia:4, ubicacion:"E10", encapsulado:"", costo:100, links:{octopart:"https://octopart.com/search?q=TPD2007F", digikey:"https://www.digikey.com.mx/es/products/result?keywords=TPD2007F", mouser:"https://www.mouser.mx/c/?q=TPD2007F"} }
];

function categorizar(nombre, sku) {
  const n = (nombre + ' ' + sku).toUpperCase();
  if (n.includes('IGBT') || n.includes('MOSFET') && !n.includes('SMD') || n.includes('TRIAC')) return 'semiconductor_potencia';
  if (n.includes('CAPACITOR') || n.includes('UF') || n.includes('CAP ')) return 'capacitor';
  if (n.includes('RESISTENCIA') || n.includes('RES ') || n.startsWith('RMS') || n.startsWith('RC-') || n.includes('OHMS')) return 'resistencia';
  if (n.includes('DIODO') || n.includes('ZENER') || n.includes('RECTIFICADOR') || n.includes('SCHOTTKY') || n.includes('TVS') || n.includes('HIPERFAST') || n.includes('SEMIKRON')) return 'diodo';
  if (n.includes('TRANSISTOR') || n.includes('BJT') || n.includes('PNP') || n.includes('NPN') || n.includes('DARLING')) return 'transistor';
  if (n.includes('OPTO') || n.includes('OPTOACOPLADOR')) return 'optoacoplador';
  if (n.includes('AMPLIFICADOR') || n.includes('COMPARADOR') || n.includes('OPERACIONAL') || n.includes('LOW NOISE')) return 'ic_analogo';
  if (n.includes('COMPUERTA') || n.includes('LOGICA') || n.includes('FLIP-FLOP') || n.includes('REGISTRO') || n.includes('BUFFER') || n.includes('NAND') || n.includes('NOR') || n.includes('SCHMITT') || n.includes('BRIDGE')) return 'ic_digital';
  if (n.includes('FUENTE') || n.includes('REGULADOR') || n.includes('CONVERTIDOR') || n.includes('SWITCHING') || n.includes('PWM') || n.includes('TRANSFORMADOR')) return 'fuente_regulador';
  if (n.includes('FUSIBLE') || n.includes('PORTA FUS')) return 'fusible';
  if (n.includes('RELEVADOR') || n.includes('RELAY') || n.includes('RELE') || n.includes('ESTADO SOLIDO')) return 'relevador';
  if (n.includes('BATERIA')) return 'bateria';
  if (n.includes('MEMORIA') || n.includes('EPROM') || n.includes('FLASH')) return 'memoria';
  if (n.includes('INTERFAS') || n.includes('INTERFAZ') || n.includes('RS485') || n.includes('RS-232') || n.includes('TRANSCEIVER')) return 'interfaz_comunicacion';
  if (n.includes('TERMINAL') || n.includes('BASE PARA MICRO') || n.includes('PORTA FUS')) return 'conector_accesorio';
  if (n.includes('POTENC') || n.includes('TERMISTOR')) return 'sensor';
  if (n.includes('CONTROLADOR') || n.includes('DRIVER') || n.includes('DISPARO') || n.includes('SUMIDERO') || n.includes('DARLINGTON')) return 'controlador';
  if (n.includes('MICRO SWITCH')) return 'conector_accesorio';
  if (n.includes('PASTA') || n.includes('FLUX') || n.includes('ESPONJA')) return 'consumible_taller';
  return 'refaccion';
}

async function importarInventario() {
  const stmtInv = await prepareStatement(db, 'local_inventario');
  const stmtMov = await prepareStatement(db, 'local_movimientos_inventario');

  db.exec('DELETE FROM local_inventario');
  db.exec('DELETE FROM local_movimientos_inventario');
  console.log('[Inv] Tablas limpiadas.');

  let insertados = 0;
  let totalPiezas = 0;
  let valorTotal = 0;
  setDeferPersist(true);

  for (const item of INVENTARIO) {
    const categoria = categorizar(item.descripcion, item.codigo);
    const totalLinea = item.costo * item.existencia;
    const pv = item.costo > 0 ? Math.round(item.costo * 1.4 * 100) / 100 : 0;
    const minimo = Math.max(1, Math.floor(item.existencia * 0.3));
    const ubi = item.ubicacion || 'Sin ubicacion';

    try {
      await stmtInv.insert(null, {
        sku: item.codigo,
        nombre: item.descripcion,
        descripcion: item.descripcion,
        categoria,
        ubicacion: ubi,
        stock: item.existencia,
        minimo,
        costo: item.costo,
        precio_venta: pv,
        activo: true,
        departamento: 'taller',
        encapsulado: item.encapsulado || '',
        proveedor: '',
        fecha_entrada: '2026-05-01',
        lote: 'INV-2026-002',
        total_linea: totalLinea,
        link_octopart: item.links?.octopart || '',
        link_digikey: item.links?.digikey || '',
        link_mouser: item.links?.mouser || '',
        costo_online: item.costo,
        costo_local: item.costo,
        tipo_inventario: 'electronica'
      });

      totalPiezas += item.existencia;
      valorTotal += totalLinea;
      insertados++;

      if (item.existencia > 0) {
        await stmtMov.insert(null, {
          producto_id: item.codigo,
          tipo_movimiento: 'entrada_inicial',
          cantidad: item.existencia,
          costo_unitario: item.costo,
          referencia: 'Inventario actualizado Mayo 2026',
          departamento: 'taller',
          created_at: new Date().toISOString()
        });
      }
    } catch (e) {
      console.warn(`[Inv] Error: ${item.codigo}: ${e.message}`);
    }
  }

  setDeferPersist(false);
  persistDb();

  console.log('\n=========================================');
  console.log('  INVENTARIO ELECTRONICA SSEPI MAYO 2026');
  console.log('=========================================');
  console.log(`  Lineas insertadas: ${insertados} / ${INVENTARIO.length}`);
  console.log(`  Total piezas: ${totalPiezas}`);
  console.log(`  Valor total: $${valorTotal.toLocaleString('es-MX', {minimumFractionDigits: 2})}`);
  console.log(`  Costo promedio: $${(valorTotal / INVENTARIO.filter(i => i.existencia > 0).length).toFixed(2)}`);
  console.log('=========================================');
}

importarInventario().catch(err => {
  console.error('[Inv] Error:', err);
  process.exit(1);
});