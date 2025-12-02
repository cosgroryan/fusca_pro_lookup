from sshtunnel import SSHTunnelForwarder
import mysql.connector
import os
import logging

# Set logging level - suppress paramiko debug messages
logging.basicConfig(level=logging.INFO)
# Specifically silence paramiko transport debug messages
logging.getLogger('paramiko.transport').setLevel(logging.WARNING)
logging.getLogger('paramiko').setLevel(logging.WARNING)

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

    # Use port 0 to let the OS choose an available port (fixes multi-worker conflicts)
    tunnel = SSHTunnelForwarder(
        (ssh_host, ssh_port),
        ssh_username=ssh_user,
        ssh_pkey=ssh_key_path,
        allow_agent=False,                   # ❗️turn off SSH agent fallback
        host_pkey_directories=[],           # ❗️prevent scanning for default keys
        remote_bind_address=(db_host, db_port),
        local_bind_address=('127.0.0.1', 0)  # Port 0 = auto-assign available port
    )

    tunnel.start()
    local_port = tunnel.local_bind_port
    print(f"tunnel found on local port {local_port}")

    conn = mysql.connector.connect(
        host='127.0.0.1',
        port=local_port,  # Use the dynamically assigned port
        user=db_user,
        password=db_password,
        database=db_name,
        connection_timeout=5,
        use_pure=True
    )

    print(f"Connected via SSH tunnel on port {local_port}")
    return conn, tunnel

if __name__ == "__main__":
    get_db_connection()
