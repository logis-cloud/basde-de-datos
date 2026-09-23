import pymysql
from faker import Faker
import random
from datetime import datetime

fake = Faker('es_ES')

# Conexión local interna dentro del contenedor
DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': 'rootpassword',
    'database': 'db_clientes'
}

TOTAL_CLIENTES = 20000
BATCH_SIZE = 1000

def populate():
    conn = pymysql.connect(**DB_CONFIG)
    cursor = conn.cursor()

    cliente_ids = []
    for i in range(0, TOTAL_CLIENTES, BATCH_SIZE):
        batch_clientes = [
            (
                fake.first_name(),
                fake.last_name(),
                fake.unique.email(),
                fake.phone_number(),
                fake.unique.numerify('########'),
                datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                1
            )
            for _ in range(BATCH_SIZE)
        ]
        sql_cli = "INSERT INTO clientes (nombre, apellido, email, telefono, dni, fecha_registro, activo) VALUES (%s, %s, %s, %s, %s, %s, %s)"
        cursor.executemany(sql_cli, batch_clientes)
        conn.commit()
        
        last_id = cursor.lastrowid
        cliente_ids.extend(range(last_id, last_id + len(batch_clientes)))

    batch_direcciones = []
    for c_id in cliente_ids:
        num_direcciones = random.choices([1, 2], weights=[0.8, 0.2])[0]
        for idx in range(num_direcciones):
            es_principal = 1 if idx == 0 else 0
            tipo = 'casa' if es_principal else 'trabajo'
            batch_direcciones.append((
                c_id, fake.street_address(), fake.city_suffix(), "Lima",
                fake.postcode(), fake.sentence(nb_words=4), tipo, es_principal
            ))
            if len(batch_direcciones) >= BATCH_SIZE:
                sql_dir = "INSERT INTO direcciones (cliente_id, calle, distrito, ciudad, codigo_postal, referencia, tipo, es_principal) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)"
                cursor.executemany(sql_dir, batch_direcciones)
                conn.commit()
                batch_direcciones = []

    if batch_direcciones:
        sql_dir = "INSERT INTO direcciones (cliente_id, calle, distrito, ciudad, codigo_postal, referencia, tipo, es_principal) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)"
        cursor.executemany(sql_dir, batch_direcciones)
        conn.commit()

    cursor.close()
    conn.close()

if __name__ == "__main__":
    populate()
