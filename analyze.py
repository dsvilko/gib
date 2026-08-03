import re

def tokenize_javascript(js):
    tokens = []
    i = 0
    n = len(js)
    line = 1
    
    KEYWORDS = {
        'let', 'const', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 
        'switch', 'case', 'break', 'continue', 'new', 'this', 'typeof', 'instanceof', 
        'in', 'of', 'class', 'try', 'catch', 'finally', 'throw', 'import', 'export', 
        'default', 'delete', 'void', 'async', 'await'
    }
    
    template_stack = []
    brace_depth = 0
    
    while i < n:
        c = js[i]
        
        if c == '\n':
            line += 1
            i += 1
            continue
        elif c.isspace():
            i += 1
            continue
            
        # Comments
        if c == '/' and i + 1 < n and js[i+1] == '/':
            i += 2
            while i < n and js[i] != '\n':
                i += 1
            continue
        elif c == '/' and i + 1 < n and js[i+1] == '*':
            i += 2
            while i + 1 < n and not (js[i] == '*' and js[i+1] == '/'):
                if js[i] == '\n':
                    line += 1
                i += 1
            i += 2
            continue
            
        # String Literals
        if c in ("'", '"'):
            quote = c
            i += 1
            val = []
            while i < n:
                if js[i] == '\n':
                    line += 1
                if js[i] == '\\' and i + 1 < n:
                    val.append(js[i:i+2])
                    i += 2
                elif js[i] == quote:
                    i += 1
                    break
                else:
                    val.append(js[i])
                    i += 1
            tokens.append(('STRING', "".join(val), line))
            continue
            
        # Template String Literals
        if c == '`':
            i += 1
            val = []
            while i < n:
                if js[i] == '\n':
                    line += 1
                if js[i] == '\\' and i + 1 < n:
                    val.append(js[i:i+2])
                    i += 2
                elif js[i] == '`':
                    i += 1
                    break
                elif js[i] == '$' and i + 1 < n and js[i+1] == '{':
                    if val:
                        tokens.append(('STRING', "".join(val), line))
                        val = []
                    tokens.append(('SYMBOL', '${', line))
                    template_stack.append(brace_depth)
                    brace_depth = 0
                    i += 2
                    break
                else:
                    val.append(js[i])
                    i += 1
            else:
                if val:
                    tokens.append(('STRING', "".join(val), line))
                continue
            continue
            
        # Brace handling for template placeholders
        if c == '{':
            brace_depth += 1
            tokens.append(('SYMBOL', '{', line))
            i += 1
            continue
        if c == '}':
            if brace_depth == 0 and template_stack:
                tokens.append(('SYMBOL', '}', line))
                brace_depth = template_stack.pop()
                i += 1
                val = []
                while i < n:
                    if js[i] == '\n':
                        line += 1
                    if js[i] == '\\' and i + 1 < n:
                        val.append(js[i:i+2])
                        i += 2
                    elif js[i] == '`':
                        i += 1
                        break
                    elif js[i] == '$' and i + 1 < n and js[i+1] == '{':
                        if val:
                            tokens.append(('STRING', "".join(val), line))
                            val = []
                        tokens.append(('SYMBOL', '${', line))
                        template_stack.append(brace_depth)
                        brace_depth = 0
                        i += 2
                        break
                    else:
                        val.append(js[i])
                        i += 1
                else:
                    if val:
                        tokens.append(('STRING', "".join(val), line))
                continue
            else:
                if brace_depth > 0:
                    brace_depth -= 1
                tokens.append(('SYMBOL', '}', line))
                i += 1
                continue
                
        # Identifiers / Keywords
        if c.isalpha() or c in ('_', '$'):
            start_i = i
            i += 1
            while i < n and (js[i].isalnum() or js[i] in ('_', '$')):
                i += 1
            word = js[start_i:i]
            if word in KEYWORDS:
                tokens.append(('KEYWORD', word, line))
            else:
                tokens.append(('IDENTIFIER', word, line))
            continue
            
        # Numbers
        if c.isdigit():
            start_i = i
            i += 1
            while i < n and (js[i].isdigit() or js[i] == '.'):
                i += 1
            tokens.append(('NUMBER', js[start_i:i], line))
            continue
            
        # Multi-char operators or Single-char Symbols
        if js[i:i+3] in ('===', '!==', '&&=', '||='):
            tokens.append(('SYMBOL', js[i:i+3], line))
            i += 3
        elif js[i:i+2] in ('==', '!=', '>=', '<=', '+=', '-=', '*=', '/=', '++', '--', '=>', '&&', '||'):
            tokens.append(('SYMBOL', js[i:i+2], line))
            i += 2
        else:
            tokens.append(('SYMBOL', c, line))
            i += 1
            
    return tokens

def parse_declarations(tokens):
    defined_functions = []
    declared_variables = []
    
    i = 0
    num_tokens = len(tokens)
    
    while i < num_tokens:
        tok_type, tok_val, tok_line = tokens[i]
        
        # Function declarations
        if tok_type == 'KEYWORD' and tok_val == 'function':
            if i + 1 < num_tokens and tokens[i+1][0] == 'IDENTIFIER':
                func_name = tokens[i+1][1]
                defined_functions.append((func_name, tokens[i+1][2]))
                i += 2
                continue
                
        # Variable declarations
        if tok_type == 'KEYWORD' and tok_val in ('let', 'const', 'var'):
            i += 1
            while i < num_tokens:
                t_type, t_val, t_line = tokens[i]
                
                if t_type == 'IDENTIFIER':
                    declared_variables.append((t_val, t_line))
                    i += 1
                elif t_type == 'SYMBOL' and t_val == '{':
                    depth = 1
                    i += 1
                    while i < num_tokens and depth > 0:
                        tt, tv, tl = tokens[i]
                        if tt == 'SYMBOL':
                            if tv == '{':
                                depth += 1
                            elif tv == '}':
                                depth -= 1
                        elif tt == 'IDENTIFIER' and depth == 1:
                            declared_variables.append((tv, tl))
                        i += 1
                else:
                    break
                    
                if i >= num_tokens:
                    break
                    
                next_type, next_val, _ = tokens[i]
                if next_type == 'SYMBOL' and next_val == '=':
                    i += 1
                    depth = 0
                    b_depth = 0
                    while i < num_tokens:
                        tt, tv, tl = tokens[i]
                        if tt == 'SYMBOL':
                            if tv in ('(', '['):
                                depth += 1
                            elif tv in (')', ']'):
                                depth -= 1
                            elif tv == '{':
                                b_depth += 1
                            elif tv == '}':
                                b_depth -= 1
                            elif tv == ',' and depth == 0 and b_depth == 0:
                                break
                            elif tv == ';' and depth == 0 and b_depth == 0:
                                break
                        if tt == 'KEYWORD' and depth == 0 and b_depth == 0:
                            break
                        i += 1
                        
                if i < num_tokens:
                    tt, tv, tl = tokens[i]
                    if tt == 'SYMBOL' and tv == ',':
                        i += 1
                        continue
                    elif tt == 'SYMBOL' and tv == ';':
                        i += 1
                        break
                    else:
                        break
            continue
            
        i += 1
        
    return defined_functions, declared_variables

if __name__ == '__main__':
    with open('index.html', 'r', encoding='utf-8') as f:
        html = f.read()
        
    script_blocks = re.findall(r'<script[^>]*>(.*?)</script>', html, re.DOTALL)
    js_code = ""
    for block in script_blocks:
        if "https://cdn.jsdelivr.net/npm/chart.js" not in block:
            js_code += block + "\n"
            
    tokens = tokenize_javascript(js_code)
    funcs, vars = parse_declarations(tokens)
    
    print(f"Parsed {len(funcs)} functions:")
    for fn, l in funcs:
        print(f"  - {fn} (line {l})")
        
    print(f"\nParsed {len(vars)} variables:")
    for v, l in vars:
        print(f"  - {v} (line {l})")
