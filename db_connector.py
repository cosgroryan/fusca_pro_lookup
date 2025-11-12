from sshtunnel import SSHTunnelForwarder
import mysql.connector
import os

def get_db_connection():
    print("initialising...")

    tunnel = SSHTunnelForwarder(
        ('120.138.27.51', 22),
        ssh_username='appfusca',
        ssh_pkey=os.path.expanduser('~/.ssh/id_rsa_nopass'),
        allow_agent=False,                   # ❗️turn off SSH agent fallback
        host_pkey_directories=[],           # ❗️prevent scanning for default keys
        remote_bind_address=('mysql57', 3306),
        local_bind_address=('127.0.0.1', 33306)
    )

    tunnel.start()
    print("tunnel found")

    conn = mysql.connector.connect(
        host='127.0.0.1',
        port=33306,
        user='fuscadbuser',
        password='RQZ@xek3wyt7rhp9nha',
        database='fuscadb',
        connection_timeout=5,
        use_pure=True
    )

    print("Connected via SSH tunnel")
    return conn, tunnel

if __name__ == "__main__":
    get_db_connection()
