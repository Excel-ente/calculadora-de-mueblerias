import os

# Configuración simple
EXTENSIONES = (".css",".js",".html")
IGNORAR_DIRS = {"venv", "__pycache__", ".git", ".env", ".idea"}
ARCHIVO_SALIDA = "proyecto_completo.txt"

def es_archivo_valido(filepath):
    return filepath.endswith(EXTENSIONES)

def recorrer_proyecto(directorio_raiz="."):
    archivos = []
    for dirpath, dirnames, filenames in os.walk(directorio_raiz):
        dirnames[:] = [d for d in dirnames if d not in IGNORAR_DIRS]
        for nombre in filenames:
            if es_archivo_valido(nombre):
                archivos.append(os.path.join(dirpath, nombre))
    return archivos

def exportar_a_txt(archivos, salida):
    with open(salida, "w", encoding="utf-8") as f:
        for ruta in archivos:
            f.write("#" * 80 + "\n")
            f.write(f"# ARCHIVO: {ruta}\n")
            f.write("#" * 80 + "\n\n")
            try:
                with open(ruta, "r", encoding="utf-8") as file:
                    f.write(file.read())
            except Exception as e:
                f.write(f"# ERROR leyendo {ruta}: {e}\n")
            f.write("\n\n")

if __name__ == "__main__":
    archivos = recorrer_proyecto(".")
    exportar_a_txt(archivos, ARCHIVO_SALIDA)
    print(f"✅ Proyecto exportado a: {ARCHIVO_SALIDA}")
