# Trazo BIM

Herramienta web de dibujo arquitectónico que toma como referencia AutoCAD (planta 2D, línea de comandos, capas, cotas) y Revit (muros, puertas y ventanas como elementos, modelo 3D que se genera solo).

## Qué hace hoy

- **Planta 2D:** muros, puertas, ventanas, líneas y cotas con ORTO (F8) y referencias a objetos (F3).
- **Línea de comandos estilo AutoCAD:** `M` muro, `P` puerta, `V` ventana, `L` línea, `C` cota, `H` habitación, `LO` losa, `MO` mover, `CO` copiar, `SI` simetría, `TR` recortar, `AL` alargar, `DE` desfase, `B` borrar, `U` deshacer, `Z` encuadrar. Mientras dibujas, teclea una longitud (`4.5`) o coordenadas (`3,2` o `@1,0`).
- **Edición:** selecciona un muro y arrastra sus pinzamientos para estirarlo o moverlo; los muros unidos lo siguen y los huecos conservan su posición.
- **Selección múltiple:** Mayús o Ctrl + clic, o ventana de selección (de izquierda a derecha, lo que queda dentro; de derecha a izquierda, también lo que cruza). Mover, copiar, simetría (`SI`) y borrar actúan sobre toda la selección.
- **Recortar, alargar y desfase:** recorta el tramo de muro o línea entre los bordes más cercanos al clic, alarga un extremo hasta el siguiente muro o línea, y crea copias paralelas a una distancia tecleada. Las puertas y ventanas conservan su posición.
- **Importar DXF:** líneas y polilíneas (LINE, LWPOLYLINE, POLYLINE) como anotación, con detección de unidades. "Convertir líneas en muros" las pasa a muros.
- **Habitaciones:** superficie útil calculada desde los muros.
- **Niveles:** varias plantas con nombre y cota. "Nuevo nivel" crea una planta vacía encima (el nivel de abajo se ve en gris como referencia) y "Duplicar" copia la planta activa.
- **Losas:** contorno por puntos (`LO`), se cierra en el primer punto o con Intro; muestra superficie y espesor.
- **3D:** modelo generado a partir de todas las plantas, apiladas según su cota (Three.js).
- **Exportación DXF** por capas (`A-MUROS`, `A-PUERTAS`, `A-VENTANAS`, `A-COTAS`, `A-ANOTACION`, `A-HABITACIONES`, `A-LOSAS`) del nivel activo.

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

1. Planta 2D: empalme de esquinas, bloques y mobiliario, sombreados.
2. BIM: cubiertas, escaleras, tipos de muro con capas de materiales.
3. Documentación: tablas de puertas y ventanas, láminas con cajetín, impresión a PDF.
4. Intercambio: exportación IFC para Revit y ArchiCAD.
5. Proyectos en la nube y colaboración.
