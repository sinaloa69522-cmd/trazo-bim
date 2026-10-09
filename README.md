# Smartarchitect

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
- **Escaleras:** tramo recto de arranque a llegada (`ES`); calcula peldaños, huella y contrahuella para salvar el desnivel hasta el nivel de arriba y avisa si la huella es corta.
- **Sombreados:** herramienta `SB` con tramas como las de AutoCAD (sólido, rayado 45°, cruzado, fábrica, baldosa 30×30, hormigón y terreno), con escala y giro. Un clic dentro de una habitación la sombrea entera (con sus pilares como islas); fuera, se dibuja el contorno. Salen en las láminas y en el DXF (`A-SOMBREADOS`).
- **Mobiliario:** biblioteca de camas, sofá, mesa con sillas, escritorio, armario, encimera de cocina, frigorífico, inodoro, lavabo, ducha y bañera (`MB`). Se colocan con un clic, `R` gira 90° y se pueden mover, copiar y hacer simetría. Salen en 3D, en DXF (`A-MOBILIARIO`) y en IFC como IfcFurniture o IfcSanitaryTerminal.
- **3D:** modelo generado a partir de todas las plantas, apiladas según su cota (Three.js).
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
