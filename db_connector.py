from sshtunnel import SSHTunnelForwarder
import mysql.connector
import os

def get_db_connection():
    """
    Establish database connection via SSH tunnel
    Credentials should be set via environment variables
    """
    print("initialising...")
    
    # Get configuration from environment variables
    ssh_host = os.environ.get('SSH_HOST', '120.138.27.51')
    ssh_port = int(os.environ.get('SSH_PORT', '22'))
    ssh_user = os.environ.get('SSH_USER', 'appfusca')
    ssh_key_path = os.environ.get('SSH_KEY_PATH', os.path.expanduser('~/.ssh/id_rsa_nopass'))
    
    db_host = os.environ.get('DB_HOST', 'mysql57')
    db_port = int(os.environ.get('DB_PORT', '3306'))
    db_user = os.environ.get('DB_USER', 'fuscaread')
    db_password = os.environ.get('DB_PASSWORD', 'ydv.mqy3avy7jxj6WXZ')
    db_name = os.environ.get('DB_NAME', 'fuscadb')

    tunnel = SSHTunnelForwarder(
        (ssh_host, ssh_port),
        ssh_username=ssh_user,
        ssh_pkey=ssh_key_path,
        allow_agent=False,                   # ❗️turn off SSH agent fallback
        host_pkey_directories=[],           # ❗️prevent scanning for default keys
        remote_bind_address=(db_host, db_port),
        local_bind_address=('127.0.0.1', 33306)
    )

    tunnel.start()
    print("tunnel found")

    conn = mysql.connector.connect(
        host='127.0.0.1',
        port=33306,
        user=db_user,
        password=db_password,
        database=db_name,
        connection_timeout=5,
        use_pure=True
    )

    print("Connected via SSH tunnel")
    return conn, tunnel

if __name__ == "__main__":
    get_db_connection()
