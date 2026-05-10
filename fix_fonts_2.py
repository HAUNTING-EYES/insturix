import os
import re

directories = [
    "/home/harsimran-singh/Documents/Insturix/Front-End/components/dashboard"
]

replacements = {
    r'fontSize:\s*12\b': 'fontSize: 11',
    r'fontSize:\s*15\b': 'fontSize: 14',
    r'fontSize:\s*16\b': 'fontSize: 14',
    r'fontSize:\s*17\b': 'fontSize: 18',
    r'fontSize:\s*20\b': 'fontSize: 18',
    r'fontSize:\s*40\b': 'fontSize: 44',
    r'fontSize:\s*\'12px\'': 'fontSize: \'11px\'',
    r'fontSize:\s*\'15px\'': 'fontSize: \'14px\'',
    r'fontSize:\s*\'16px\'': 'fontSize: \'14px\'',
    r'fontSize:\s*\'17px\'': 'fontSize: \'18px\'',
    r'fontSize:\s*\'20px\'': 'fontSize: \'18px\''
}

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    new_content = content
    for pattern, replacement in replacements.items():
        new_content = re.sub(pattern, replacement, new_content)
        
    if new_content != content:
        with open(filepath, 'w') as f:
            f.write(new_content)
        print(f"Updated {filepath}")

for d in directories:
    if not os.path.exists(d):
        continue
    for root, dirs, files in os.walk(d):
        for file in files:
            if file.endswith('.tsx') or file.endswith('.ts'):
                process_file(os.path.join(root, file))

print("Done")
