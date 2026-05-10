import os
import re

directories = [
    "/home/harsimran-singh/Documents/Insturix/Front-End/app"
]

replacements = {
    r'\btext-xs\b': 'text-[11px]',
    r'\btext-base\b': 'text-[14px]',
    r'\btext-xl\b': 'text-[18px]',
    r'\btext-3xl\b': 'text-[32px]',
    r'\btext-4xl\b': 'text-[44px]',
    r'\btext-5xl\b': 'text-[44px]',
    r'\btext-6xl\b': 'text-[110px]',
    r'text-\[12px\]': 'text-[11px]',
    r'text-\[15px\]': 'text-[14px]',
    r'text-\[16px\]': 'text-[14px]',
    r'text-\[17px\]': 'text-[18px]',
    r'text-\[20px\]': 'text-[18px]',
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
