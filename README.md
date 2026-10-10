# Smartarchitect

**Abrir la app:** https://sinaloa69522-cmd.github.io/trazo-bim/ · se instala como aplicación (botón «Instalar app» en Chrome y Edge, o Compartir › «Agregar a pantalla de inicio» en iPhone) y funciona sin internet. Cada cambio en `main` se publica solo con la acción «Publicar app» en la rama `gh-pages`.

Herramienta web de dibujo arquitectónico que toma como referencia AutoCAD (planta 2D, línea de comandos, capas, cotas) y Revit (muros, puertas y ventanas como elementos, modelo 3D que se genera solo).

## Qué hace hoy

- **Planta 2D:** muros, puertas, ventanas, líneas y cotas con ORTO (F8) y referencias a objetos (F3).
- **Línea de comandos estilo AutoCAD:** `M` muro, `P` puerta, `V` ventana, `L` línea, `C` cota, `H` habitación, `LO` losa, `CU` cubierta, `ES` escalera, `MB` mobiliario, `MO` mover, `CO` copiar, `SI` simetría, `TR` recortar, `AL` alargar, `DE` desfase, `B` borrar, `U` deshacer, `Z` encuadrar. Mientras dibujas, teclea una longitud (`4.5`) o coordenadas (`3,2` o `@1,0`).
- **Edición:** selecciona un muro y arrastra sus pinzamientos para estirarlo o moverlo; los muros unidos lo siguen y los huecos conservan su posición.
- **Selección múltiple:** Mayús o Ctrl + clic, o ventana de selección (de izquierda a derecha, lo que queda dentro; de derecha a izquierda, también lo que cruza). Mover, copiar, simetría (`SI`) y borrar actúan sobre toda la selección.
- **Recortar, alargar y desfase:** recorta el tramo de muro o línea entre los bordes más cercanos al clic, alarga un extremo hasta el siguiente muro o línea, y crea copias paralelas a una distancia tecleada. Las puertas y ventanas conservan su posición.
- **Importar DWG y DXF:** líneas, polilíneas (con sus arcos), arcos, círculos, elipses, splines y bloques explotados como anotación, textos, atributos de los símbolos, cotas y sombreados (con su trama original o sólidos), con detección de unidades. El DWG se lee en el navegador con LibreDWG (WebAssembly). "Convertir líneas en muros" las pasa a muros.
- **Importar PDF:** un PDF exportado de CAD se pasa a líneas a la escala del plano (1:50, 1:100…); un plano escaneado se pone de calco.
- **Calcos:** imágenes (PNG, JPG) o páginas de PDF bajo el dibujo, con opacidad. `CAL` calibra la escala marcando una medida conocida. Se guardan dentro del archivo `.trazo`.
- **Habitaciones:** superficie útil calculada desde los muros.
- **Niveles:** varias plantas con nombre y cota. "Nuevo nivel" crea una planta vacía encima (el nivel de abajo se ve en gris como referencia) y "Duplicar" copia la planta activa.
- **Losas:** contorno por puntos (`LO`), se cierra en el primer punto o con Intro; muestra superficie y espesor.
- **Cubiertas:** rectangulares, planas, a dos aguas o a cuatro aguas, con pendiente, vuelo y altura de arranque. La cumbrera va en la dirección larga.
- **Materiales exteriores:** al seleccionar un muro, «Revestimiento exterior» ofrece 12 tipos de siding (vinil traslapado y Dutch lap, fibrocemento Hardie, madera de ingeniería, cedro biselado, tabla y listón, T1-11, tejuelas de cedro, estuco, ladrillo caravista, piedra y panel metálico); al seleccionar una cubierta, «Material de cubierta» ofrece 12 (teja asfáltica 3 tabs y arquitectónica, cedro, teja cerámica y de concreto, pizarra, lámina de junta alzada y corrugada, membranas TPO, EPDM y asfalto modificado, y cubierta vegetal). Con varios elementos seleccionados se aplica a todos. Se ven con textura en 3D, con su despiece en los alzados y en la leyenda «Acabados exteriores» de las láminas de fachada, y cambian las notas del juego de permiso.
- **Tipos de puertas y ventanas:** al seleccionar una puerta o ventana (o varias, con Mayús + clic) se elige su tipo en un muestrario con su alzado. Puertas: de una hoja, principal con vidrios laterales, doble, francesa, corrediza de vidrio, de bolsillo, plegable, de granero, holandesa y de cochera seccional. Ventanas: fija, ventanal, guillotina simple y doble, corrediza, abatible, abatible doble, proyectante, basculante y de persiana de vidrio. Al cambiar el tipo toma sus medidas habituales si caben. Cada tipo tiene su símbolo en planta y DXF, su carpintería en 3D, sus montantes y triángulo de apertura en los alzados, una columna «Tipo» en los cuadros de puertas y ventanas, su tipo de apertura en el IFC y su partida en el presupuesto. Las de la barra (Puerta, Ventana) usan el tipo elegido en «Puerta nueva» y «Ventana nueva».
- **Escaleras:** tramo recto de arranque a llegada (`ES`); calcula peldaños, huella y contrahuella para salvar el desnivel hasta el nivel de arriba y avisa si la huella es corta.
- **Sombreados:** herramienta `SB` con tramas como las de AutoCAD (sólido, rayado 45°, cruzado, fábrica, baldosa 30×30, hormigón y terreno), con escala y giro. Un clic dentro de una habitación la sombrea entera (con sus pilares como islas); fuera, se dibuja el contorno. Salen en las láminas y en el DXF (`A-SOMBREADOS`).
- **Mobiliario:** biblioteca de camas, sofá, mesa con sillas, escritorio, armario, encimera de cocina, frigorífico, inodoro, lavabo, ducha y bañera (`MB`). Se colocan con un clic, `R` gira 90° y se pueden mover, copiar y hacer simetría. Salen en 3D, en DXF (`A-MOBILIARIO`) y en IFC como IfcFurniture o IfcSanitaryTerminal.
- **Planos para Estados Unidos:** el botón Unidades › ft-in pasa el proyecto a pies y pulgadas. Cotas, superficies (sq ft), propiedades y coordenadas se escriben como 12'-6" y en la línea de comandos se teclea `12'6"`, `12'-6 1/2"`, `6"` o `12` (pies); `x;y` también acepta pies. Las medidas por defecto pasan a las de EE.UU. (muro de bastidor 2x6, techo a 9', puerta 3'-0" × 6'-8", ventana 3'-0" × 4'-0", pendiente 6:12) y hay tipos de muro 2x4, 2x6 y CMU 8", camas queen y king, escaleras con contrahuella de 7 1/2" como máximo del IRC, láminas en papel Tabloid (11" × 17") con escalas 1/4" = 1'-0", 1/8" = 1'-0"…, DXF en pulgadas (`$INSUNITS` 1) e importación de PDF a escalas de EE.UU. El modelo se sigue guardando en metros y se puede volver a m en cualquier momento.
- **Juego para permiso de construcción (EE.UU.):** en ft-in, Lámina › Contenido › «Juego de permiso EE.UU.» da las 16 láminas en inglés, cada una con sus notas: Cover Sheet (G-001, con datos del proyecto, códigos e índice), General Notes (G-002), Site Plan (C-101, terreno con retiros y entrada de coches), Foundation Plan (S-101, zapatas F1/F2 y anclas), Floor Framing, Wall Framing (dinteles H#), Roof Framing (S-10x), Floor Plan (A-101), Elevations (A-201/202), Sections (A-301), Typical Details (A-501), Foundation Details (A-502: crawl space, muro CMU, pilar y viga, zapata de poste) y Stair, Window & Deck Details (A-503), Electrical (E-101), Plumbing (P-101) y Mechanical/HVAC (M-101, rejillas, ductos y equipos). El botón «Juego para permiso» imprime todo el juego en PDF. Los tamaños de viguetas, cabios y dinteles salen de las tablas del IRC 2021 y son preliminares: deben revisarlos y sellarlos un profesional con licencia.
- **Mobiliario y entorno:** más de 60 piezas por grupos (dormitorio, estar, comedor, cocina y lavado, baño, oficina, exterior y jardín, vehículos, personas y vegetación), con miniatura en el catálogo, símbolo en planta y volumen con color en el 3D: sofás, sillones, literas, isla de cocina, lavadora, alberca, jacuzzi, sedán, SUV, pickup, moto, bicicleta, personas de pie, caminando y en silla de ruedas, árboles, pino, palmera, arbustos y setos. En IFC la vegetación sale como `IfcGeographicElement` y vehículos y personas como `IfcBuildingElementProxy`.
- **Celular y tablet:** en pantallas chicas la planta ocupa la pantalla, las herramientas van en una fila que se desliza, Abrir, Guardar, Importar y Exportar están en el menú "Archivo", y capas, propiedades y catálogos salen en un panel deslizable. Con dos dedos se acerca y se desplaza; con una herramienta de dibujo, tocar coloca el punto y arrastrar mueve la vista sin dibujar.
- **3D:** modelo generado a partir de todas las plantas, apiladas según su cota (Three.js).
- **Juego ejecutivo en metros (México):** en m, Lámina › Contenido › «Juego ejecutivo en metros (México)» da las láminas en español con simbología, cuadros y notas: portada con índice de planos y datos del proyecto (G-01), notas generales con reglamentos, abreviaturas y simbología general (G-02), planta arquitectónica, fachadas, cortes y elevaciones (ARQ), planta de cimentación con zapatas corridas ZC y aisladas ZA, castillos K-1 y columnas C-1 (EST-01), planta estructural de losa con trabes y tableros (EST-02), detalles de cimentación, castillos, columnas, cadenas, trabes, losa, escalera y pretil (EST-03/04), detalles estructurales complementarios: nudo columna-trabe, cerramiento en vano, hueco en losa y anclaje de castillos (EST-05), detalles arquitectónicos con cuadro de acabados (ARQ-06), instalación eléctrica con cuadro de cargas y diagrama unifilar (IE), hidráulica (IH) y sanitaria (IS) por nivel, y detalles de instalaciones: registro sanitario, tinaco, tierra física y alturas de salidas (DI-01). La herramienta `CL` coloca columnas. Las secciones son un predimensionado que debe revisar y firmar un ingeniero estructurista.
- **Estructura de framing en 3D:** el botón «Estructura» del visor 3D cambia el modelo por toda su estructura de madera: zapatas corridas, solera inferior y doble solera superior, montantes a 16" con king y jack studs en cada hueco, dinteles, antepechos y cojinetes, montantes del hastial, viguetas de piso o techo a 16" por habitación, y cabios a 24" con cumbrera y limatesas. Las escuadrías salen del predimensionado del IRC del juego de permiso, y una leyenda resume piezas y longitudes por tipo. Otro clic vuelve al modelo completo.
- **Tipos de cimentación:** en el panel Niveles se elige la cimentación: losa con zapatas corridas, losa monolítica de borde engrosado, losa sobre muro de block (stem wall), crawl space con muro de block y piso de madera, sótano con muros de concreto de 8' y columnas de acero, o pilares y vigas (pier & beam). Cada tipo se ve en el 3D (el terreno baja para que asomen el block o los pilares), en la vista Estructura con su piso de madera, y en la lámina S-101 con su planta de cimentación, tabla de zapatas, leyenda y notas del IRC.
- **Pisos y techos de madera:** la vista Estructura separa floor joists (con su rim joist, blocking a media luz y subpiso de OSB de 3/4") y ceiling joists en la última planta; con una planta encima, su piso acaba a la cota de esa planta y los muros de abajo se entraman hasta la cara inferior de las viguetas. La cubierta lleva collar ties a 48" y fascia. Un clic en cada fila de la leyenda oculta o muestra ese tipo de pieza.
- **Decks y porches (DK):** deck de madera tratada, de composite o a ras de suelo, porche cubierto, porche con mosquitero y stoop de concreto, dibujados con dos esquinas. El lado que toca la casa lleva ledger; los demás, barandal de madera, aluminio, cable, vidrio o vinilo a 36". Los escalones cumplen el IRC (contrahuella de 7 3/4" como máximo, huella de 10") y llevan pasamanos; el panel avisa si falta barandal a más de 30" o pasamanos con 4 contrahuellas o más. En Estructura salen ledger, viguetas P.T. a 16", viga, postes 6x6 con zapata, zancas y, en los porches, columnas, viga y cabios.
- **Lámina (documentación):** vista "Lámina" con la planta activa en A3 a escala normalizada (automática o elegida), marcas de puertas y ventanas (P1, V1…), tablas de puertas, ventanas y superficies útiles, escala gráfica y cajetín editable (proyecto, autor, cliente, fecha). En "Contenido" se elige entre la planta y los **alzados**: las cuatro fachadas generadas del modelo, con carpinterías, cubierta, terreno y cotas de nivel. "Imprimir / PDF" la imprime o la guarda como PDF desde el navegador.
- **Exportación IFC (IFC4):** el modelo BIM completo, con un nivel (IfcBuildingStorey) por planta, muros con sus huecos, puertas y ventanas con su marca, losas, cubiertas, escaleras y espacios con su superficie. Se abre en Revit, ArchiCAD, BIMcollab Zoom y cualquier visor IFC. Botón Exportar › IFC o comando `IFC`.
- **Exportación DXF** por capas (`A-MUROS`, `A-PUERTAS`, `A-VENTANAS`, `A-COTAS`, `A-ANOTACION`, `A-HABITACIONES`, `A-LOSAS`, `A-CUBIERTAS`, `A-ESCALERAS`, `A-SOMBREADOS`) del nivel activo.

El dibujo se guarda en el navegador (localStorage).

## Desarrollo

```bash
npm install
npm run dev        # servidor local
npm test           # pruebas (Vitest)
npm run build      # comprobación de tipos y build de producción
```

## Estructura

- `src/core`: modelo de datos, geometría, cálculo de habitaciones y DXF. Sin dependencias del navegador.
- `src/editor`: estado del editor e interacción (`Editor.ts`), dibujo de la planta (`planRenderer.ts`) y visor 3D (`Viewer3D.ts`).
- `src/ui`: interfaz React.

## Hoja de ruta

1. Planta 2D: empalme de esquinas, bloques propios.
2. BIM: cubiertas de contorno libre, escaleras con rellano, huecos en losas, tipos de muro con capas de materiales.
3. Documentación: secciones, varias vistas por lámina, cotas automáticas.
4. Intercambio: importación IFC, materiales y propiedades en el IFC.
5. Proyectos en la nube y colaboración.

## Licencia

GPL-3.0 o posterior (ver `LICENSE`). La lectura de DWG usa [LibreDWG](https://www.gnu.org/software/libredwg/) a través de `@mlightcad/libredwg-web`, que es GPL-3.0.
