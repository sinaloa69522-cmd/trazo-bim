// Textos fijos del juego ejecutivo de México: reglamentos aplicables y notas generales.

export const REGLAMENTOS = [
  "Reglamento de Construcciones del municipio o estado donde se ubica la obra.",
  "Normas Técnicas Complementarias (NTC) para Diseño y Construcción de Estructuras de Concreto y de Mampostería.",
  "NTC para Diseño y Construcción de Cimentaciones y NTC sobre Criterios y Acciones para el Diseño Estructural.",
  "NOM-001-SEDE-2012, Instalaciones eléctricas (utilización).",
  "NTC para Diseño y Ejecución de Obras e Instalaciones Hidráulicas.",
  "NOM-002-CONAGUA-2015 (tuberías) y NOM-009-CONAGUA-2001 (inodoros).",
];

export const GENERALES: { title: string; notes: string[] }[] = [
  { title: "Generales", notes: [
    "Las cotas están en metros y rigen sobre el dibujo; los detalles se acotan en centímetros.",
    "Los niveles se refieren al nivel de piso terminado de planta baja, N.P.T. ±0.00.",
    "Verificar cotas, niveles y ejes en obra antes de construir; cualquier diferencia se consulta con el proyectista.",
    "Los planos arquitectónicos, estructurales y de instalaciones se complementan; ningún plano se usa por separado.",
    "El constructor es responsable de la seguridad en la obra, del apuntalamiento y de las obras provisionales.",
  ] },
  { title: "Terreno y cimentación", notes: [
    "Capacidad de carga supuesta del terreno: 8 t/m². Confirmarla con estudio de mecánica de suelos antes de colar.",
    "Despalmar 20 cm de capa vegetal y retirar raíces, basura y rellenos sueltos del área de desplante.",
    "Desplante mínimo a 0.80 m bajo el terreno natural, sobre terreno firme, con plantilla de 5 cm f'c = 100 kg/cm².",
    "Rellenos con tepetate o material de banco compactado en capas de 20 cm al 90 % de la prueba Proctor.",
  ] },
  { title: "Concreto y acero", notes: [
    "Concreto f'c = 200 kg/cm² en zapatas, cadenas y castillos; f'c = 250 kg/cm² en columnas, trabes, losas y escaleras.",
    "Agregado máximo de 19 mm (¾\"); revenimiento de 10 cm ± 2 cm; no agregar agua en obra.",
    "Acero de refuerzo corrugado fy = 4200 kg/cm²; alambrón #2 liso fy = 2530 kg/cm²; malla electrosoldada 6-6/10-10.",
    "Traslapes de 40 diámetros, no más del 50 % de las varillas en una misma sección.",
    "Vibrar todo el concreto y curarlo con agua o membrana durante 7 días como mínimo.",
    "Descimbrar trabes y losas a los 14 días como mínimo, o cuando el concreto alcance el 70 % de su resistencia.",
  ] },
  { title: "Mampostería", notes: [
    "Muros de block hueco de concreto de 12×20×40 o 15×20×40 cm (f*p ≥ 60 kg/cm²) o tabique rojo recocido.",
    "Mortero cemento-arena 1:4 con juntas de 1 cm; mojar las piezas de barro antes de asentarlas.",
    "Castillos en cada extremo e intersección de muros, en jambas de vanos y a cada 3.00 m como máximo.",
    "Cadena de cerramiento sobre todos los muros de carga y dala de repisón bajo ventanas mayores de 1.20 m.",
  ] },
  { title: "Acabados", notes: [
    "Aplanado exterior de mortero cemento-arena 1:4 de 1.5 cm, acabado fino, con pintura vinílica para exteriores.",
    "Aplanado interior de yeso a reventón de 1.5 cm con pintura vinílica; en baños, azulejo hasta 1.80 m (2.10 m en la regadera).",
    "Pisos de loseta cerámica asentada con adhesivo sobre firme de 8 cm; zoclo de 7 cm del mismo material.",
    "Azotea con relleno de tezontle al 2 %, entortado de 3 cm, chaflanes e impermeabilizante con garantía mínima de 5 años.",
  ] },
  { title: "Instalaciones", notes: [
    "Eléctrica conforme a la NOM-001-SEDE-2012: poliducto de 13 mm, conductores THW-LS y tierra física con varilla copperweld.",
    "Hidráulica en CPVC o cobre tipo M; prueba de presión a 8 kg/cm² durante 3 horas antes de cubrir las tuberías.",
    "Sanitaria en PVC con pendiente mínima del 2 %, registros a cada 10 m y ventilación sobre la azotea.",
    "No ranurar ni perforar castillos, columnas, trabes ni losas sin autorización del responsable estructural.",
  ] },
];
