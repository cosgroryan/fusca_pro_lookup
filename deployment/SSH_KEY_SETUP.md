# SSH Key Setup for EC2 Deployment

## Problem
The application needs an SSH key to connect to the database server via SSH tunnel.

**Error:** `ValueError: No password or public key available!`

---

## Solution: Copy SSH Key to EC2

### Step 1: Copy Key from Local Machine to EC2

On your **local machine**, run:

```bash
# Copy the SSH key to your EC2 instance
scp -i your-ec2-key.pem ~/.ssh/id_rsa_nopass ubuntu@YOUR-EC2-IP:/tmp/id_rsa_nopass
```

### Step 2: Move Key to Correct Location on EC2

SSH into your EC2 instance:

```bash
ssh -i your-ec2-key.pem ubuntu@YOUR-EC2-IP
```

Then move the key and set permissions:

```bash
# Create .ssh directory if it doesn't exist
mkdir -p ~/.ssh

# Move the key
mv /tmp/id_rsa_nopass ~/.ssh/id_rsa_nopass

# Set correct permissions (IMPORTANT!)
chmod 600 ~/.ssh/id_rsa_nopass
chmod 700 ~/.ssh

# Verify the key exists
ls -la ~/.ssh/id_rsa_nopass
```

### Step 3: Restart the Application

```bash
sudo systemctl restart fusca
sudo systemctl status fusca
```

---

## Alternative: Generate New Key on EC2

If you don't have the original key, generate a new one:

### Step 1: Generate SSH Key on EC2

```bash
# SSH into EC2
ssh -i your-ec2-key.pem ubuntu@YOUR-EC2-IP

# Generate new key (no passphrase)
ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa_nopass -N ""

# Display the public key
cat ~/.ssh/id_rsa_nopass.pub
```

### Step 2: Add Public Key to Database Server

Copy the output from above and add it to the `authorized_keys` file on your database server (120.138.27.51):

```bash
# On the database server (as appfusca user)
nano ~/.ssh/authorized_keys
# Paste the public key on a new line
# Save and exit

# Set permissions
chmod 600 ~/.ssh/authorized_keys
chmod 700 ~/.ssh
```

### Step 3: Test the Connection

Back on EC2:

```bash
# Test SSH connection
ssh -i ~/.ssh/id_rsa_nopass appfusca@120.138.27.51

# If successful, exit and restart the application
exit
sudo systemctl restart fusca
sudo systemctl status fusca
```

---

## Verify It's Working

```bash
# Watch the logs
sudo journalctl -u fusca -f

# Should see:
# "initialising..."
# "tunnel found"
# "Connected via SSH tunnel"
# "Database connected successfully!"

# Test the application
curl http://localhost:5001/api/filters
```

---

## Common Issues

### Issue: Permission denied (publickey)

**Solution:** Check key permissions:
```bash
chmod 600 ~/.ssh/id_rsa_nopass
chmod 700 ~/.ssh
```

### Issue: Key file not found

**Solution:** Verify the path in `/etc/fusca-env.conf`:
```bash
sudo cat /etc/fusca-env.conf | grep SSH_KEY_PATH
# Should show: SSH_KEY_PATH=/home/ubuntu/.ssh/id_rsa_nopass
```

### Issue: Connection refused

**Solution:** Check the SSH server is accessible:
```bash
# Test connection manually
ssh -i ~/.ssh/id_rsa_nopass appfusca@120.138.27.51

# Check if port 22 is open in security group
```

---

## Quick Fix Commands

```bash
# If you just uploaded the key:
chmod 600 ~/.ssh/id_rsa_nopass
sudo systemctl restart fusca

# Check logs
sudo journalctl -u fusca -n 50

# Check status
sudo systemctl status fusca
```

---

## Security Note

- The SSH key file should have `600` permissions (owner read/write only)
- Never commit SSH keys to git
- The `.ssh` directory should have `700` permissions

