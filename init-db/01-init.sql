
CREATE TABLE usuarios (
    id          SERIAL PRIMARY KEY,
    nombre      VARCHAR(100) NOT NULL,
    email       VARCHAR(150) NOT NULL UNIQUE,
    creado_en   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE productos (
    id          SERIAL PRIMARY KEY,
    nombre      VARCHAR(150) NOT NULL,
    precio      NUMERIC(10, 2) NOT NULL CHECK (precio > 0),
    stock       INT NOT NULL DEFAULT 0,
    creado_en   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE compras (
    id              SERIAL PRIMARY KEY,
    usuario_id      INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    producto_id     INT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    cantidad        INT NOT NULL CHECK (cantidad > 0),
    total           NUMERIC(10, 2) NOT NULL,
    fecha_compra    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- Usuarios (5 registros)
INSERT INTO usuarios (nombre, email) VALUES
    ('Ana García',      'ana.garcia@email.com'),
    ('Carlos López',    'carlos.lopez@email.com'),
    ('María Rodríguez', 'maria.rodriguez@email.com'),
    ('José Martínez',   'jose.martinez@email.com'),
    ('Laura Sánchez',   'laura.sanchez@email.com');

-- Productos (5 registros)
INSERT INTO productos (nombre, precio, stock) VALUES
    ('Laptop HP Pavilion',      1299.99, 15),
    ('Mouse Logitech MX',       79.50,   50),
    ('Teclado Mecánico RGB',    129.99,  30),
    ('Monitor Samsung 27"',     349.00,  20),
    ('Audífonos Sony WH-1000',  299.99,  25);

-- Compras (5 registros)
INSERT INTO compras (usuario_id, producto_id, cantidad, total) VALUES
    (1, 1, 1, 1299.99),
    (2, 2, 2, 159.00),
    (3, 3, 1, 129.99),
    (1, 4, 1, 349.00),
    (4, 5, 1, 299.99);
