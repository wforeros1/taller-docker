# Actividad 1: Orquestación de servicios con Docker Compose

Este proyecto es un stack de aplicaciones "Alquimia Etérea" orquestado con Docker Compose. Consiste en una base de datos PostgreSQL, una API REST en Node.js/Express, un frontend de 5 secciones servido por Nginx y una interfaz de administración pgAdmin.

## Estructura del Proyecto

La estructura del proyecto cumple con los entregables requeridos:

- `docker-compose.yml`: Orquestación de 4 servicios (`db`, `web`, `frontend`, `pgadmin`).
- `.env`: Variables de entorno para credenciales seguras (PostgreSQL y pgAdmin).
- `init-db/01-init.sql`: Script SQL con 4 tablas (`clientes`, `servicios`, `reservas`, `personal`) y datos iniciales en COP.
- `app/`: Directorio de la API REST.
  - `Dockerfile`: Imagen basada en Node 18 Alpine.
  - `index.js`: Código del backend con CRUD completo para Clientes y Servicios.
  - `package.json`: Definición de dependencias (`express`, `pg`, `cors`).
- `frontend/`: Directorio del Cliente Web.
  - `Dockerfile`: Imagen basada en Nginx Alpine.
  - `nginx.conf`: Configuración para servir el SPA y actuar como proxy para `/api/*`.
  - `dashboard.html`: Vista principal con estadísticas globales.
  - `directorio.html`, `catalogo.html`, `gestion.html`, `disponibilidad.html`: Vistas secundarias dinámicas.
  - `nav.js`: Lógica compartida para navegación y consumo de la API REST.

## Instrucciones de Uso

### 1. Levantar el proyecto
Navega a la raíz del proyecto y ejecuta en tu terminal:
```bash
docker compose up -d --build
```

### 2. Acceso a los servicios

| Servicio | URL | Puerto |
| :--- | :--- | :--- |
| **Frontend UI** | [http://localhost:3000](http://localhost:3000) | `3000` |
| **API Backend** | [http://localhost:5000/api](http://localhost:5000/api) | `5000` |
| **pgAdmin 4** | [http://localhost:8080](http://localhost:8080) | `8080` |

## Características Implementadas (CRUD)

El proyecto incluye la implementación completa de operaciones **CRUD** para las dos entidades principales, permitiendo la gestión dinámica desde la interfaz de usuario:

1.  **Módulo Clientes (Comunidad)**:
    *   **Create**: Modal "Nuevo Cliente" para registrar consultantes.
    *   **Read**: Listado dinámico con filtros por tipo (VIP, Regular, Nuevo).
    *   **Update**: Edición de datos existentes (Nombre, Email, Teléfono, Tipo).
    *   **Delete**: Eliminación permanente de registros con confirmación.
2.  **Módulo Servicios (Rituales)**:
    *   **CRUD Completo**: Gestión total del catálogo de masajes y bienestar, incluyendo precios en pesos colombianos (COP).
3.  **Visualización Adicional**: Dashboard con KPIs dinámicos, historial de pagos (reservas) y disponibilidad de personal.

---
# Estado de los contenedores

![alt text](<Captura desde 2026-03-24 09-48-51.png>)