# piff
A cli for working with [piff](https://github.com/allain/piff).

**Warning:** piff is a work in progress. Its syntax might change until version 1.0

## Installation

```bash
npm install -g piff-cli
```

## Usage

```bash
# compile ./file.piff to ./file.php
piff ./file.piff

# compile all piff files in a directory (even if compilation doesn't appear to be needed)
piff path/to/dir/ --force

# watch a directory and compile any .piff file that needs it
piff path/to/dir --watch

# Format all piff files in a directory
piff path/to/dir/ --format

# or with shorter params
piff path/to/dir -w

# Plays nice with stdin/out too
echo "print('hello')" | piff | php
```
