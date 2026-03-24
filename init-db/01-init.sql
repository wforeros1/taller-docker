CREATE TABLE clientes (
    id              SERIAL PRIMARY KEY,
    nombre          VARCHAR(100) NOT NULL,
    email           VARCHAR(150) NOT NULL UNIQUE,
    telefono        VARCHAR(20),
    tipo            VARCHAR(20) NOT NULL DEFAULT 'Nuevo',
    gasto_total     NUMERIC(12, 2) NOT NULL DEFAULT 0,
    ultima_visita   DATE,
    creado_en       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE servicios (
    id              SERIAL PRIMARY KEY,
    nombre          VARCHAR(150) NOT NULL,
    categoria       VARCHAR(50) NOT NULL,
    duracion_min    INT NOT NULL,
    precio          NUMERIC(12, 2) NOT NULL CHECK (precio > 0),
    estado          VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
    descripcion     TEXT,
    creado_en       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE reservas (
    id              SERIAL PRIMARY KEY,
    cliente_id      INT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    servicio_id     INT NOT NULL REFERENCES servicios(id) ON DELETE CASCADE,
    fecha_reserva   DATE NOT NULL,
    hora            TIME NOT NULL,
    estado          VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    monto           NUMERIC(12, 2) NOT NULL,
    metodo_pago     VARCHAR(30),
    creado_en       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE personal (
    id              SERIAL PRIMARY KEY,
    nombre          VARCHAR(100) NOT NULL,
    cargo           VARCHAR(80) NOT NULL,
    email           VARCHAR(150) UNIQUE,
    telefono        VARCHAR(20),
    disponible      BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Clientes (5 registros)
INSERT INTO clientes (nombre, email, telefono, tipo, gasto_total, ultima_visita) VALUES
    ('Elena Aranjuez',    'elena.ara@gmail.com',    '+57 312 345 6789', 'VIP',     2450000.00, '2025-10-12'),
    ('Julián Moreno',     'j.moreno@gmail.com',        '+57 301 123 4567', 'Regular',  820000.00, '2025-10-14'),
    ('Sofía Castillo',   'sofia.cast@gmail.com',       '+57 315 888 2222', 'VIP',     1890000.00, '2025-10-05'),
    ('Roberto Vallés',   'rvalles@gmail.com',       '+57 300 111 2222', 'Nuevo',    150000.00, '2025-10-13'),
    ('Alessandra Vidal', 'alessandra.gmail.com',    '+57 318 999 3333', 'VIP',     3200000.00, '2025-10-10');

-- Servicios (5 registros — precios en pesos colombianos)
INSERT INTO servicios (nombre, categoria, duracion_min, precio, estado, descripcion) VALUES
    ('Masaje de Piedras Volcánicas',  'Masajes',           90,  120000.00, 'ACTIVO',   'Relajación profunda con calor'),
    ('Sesión Yoga Lunar',            'Bienestar y Yoga',  60,   45000.00, 'ACTIVO',   'Conexión espiritual nocturna'),
    ('Manicura de Terciopelo',       'Belleza y Uñas',    45,   65000.00, 'INACTIVO', 'Tratamiento de seda y color'),
    ('Facial Alquímico',             'Belleza y Uñas',    75,  155000.00, 'ACTIVO',   'Extractos botánicos curativos'),
    ('Ritual Eclipse Solar',         'Masajes',          120,  250000.00, 'ACTIVO',   'Termoterapia con aceites de ámbar');

-- Reservas (5 registros)
INSERT INTO reservas (cliente_id, servicio_id, fecha_reserva, hora, estado, monto, metodo_pago) VALUES
    (1, 1, '2025-10-14', '18:00', 'PAGADO',      120000.00, 'Stripe'),
    (2, 2, '2025-10-15', '20:30', 'PENDIENTE',     45000.00, 'Efectivo'),
    (3, 4, '2025-10-16', '10:00', 'PAGADO',       155000.00, 'Transferencia'),
    (5, 5, '2025-10-17', '15:00', 'PAGADO',       250000.00, 'PayPal'),
    (4, 3, '2025-10-18', '11:30', 'REEMBOLSADO',   65000.00, 'Stripe');

-- Personal (5 registros)
INSERT INTO personal (nombre, cargo, email, telefono, disponible) VALUES
    ('Camila Ríos',     'Terapeuta Holística',   'camila.rios@gmail.com',   '+57 310 100 2001', TRUE),
    ('Diego Navarro',   'Instructor de Yoga',    'diego.nav@gmail.com',     '+57 310 100 2002', TRUE),
    ('Valentina Mora',  'Esteticista Senior',    'val.mora@gmail.com',      '+57 310 100 2003', FALSE),
    ('Andrés Paredes',  'Masajista Certificado', 'andres.par@gmail.com',    '+57 310 100 2004', TRUE),
    ('Isabella Torres', 'Recepcionista',         'isabella.tor@gmail.com',  '+57 310 100 2005', TRUE);
