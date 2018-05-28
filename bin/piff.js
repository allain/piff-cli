#!/usr/bin/env node

const IGNORED_DIRS = /node_modules|.git/

const Lazy = require('lazy.js')
const watch = require('glob-watcher')
const glob = require('glob')
const fs = require('fs-extra')
const flatten = require('flatten')

const USAGE = fs.readFileSync(__dirname + '/usage.txt', 'utf-8')
const getStdin = require('get-stdin')
const argv = require('minimist')(process.argv, {
  boolean: ['w', 'watch', 'f', 'force', 'format']
})
argv._.splice(0, 2)

const { format, transpile } = require('piff')

const eachSeries = (arr, f) => {
  return arr.reduce((last, item) => {
    return last.then(() => f(item))
  }, Promise.resolve())
}

const bail = msg => {
  console.error(msg)
  process.exit(1)
}

const helping = !!(argv.h || argv.help)
if (helping) {
  console.log(USAGE)
  process.exit(0)
}

const hasPatterns = argv._.length
const watching = !!(argv.w || argv.watch)
const formatting = !!argv.format
const forced = !!(argv.f || argv.force)

if (process.stdin.isTTY && !hasPatterns) {
  bail('ERROR: no patterns given\n\n' + USAGE)
} else if (!process.stdin.isTTY && hasPatterns) {
  bail('ERROR: patterns given when reading from stdin\n\n' + USAGE)
} else if (!process.stdin.isTTY && watching) {
  bail('ERROR: cannot watch stdin\n\n' + USAGE)
} else if (watching && formatting) {
  bail('ERROR: cannot watch and format at the same time\n\n' + USAGE)
}

const compileFile = path => {
  console.log(ts(), 'compiling', path)
  return fs
    .readFile(path, 'utf-8')
    .then(src => {
      if (!src) throw new Error('src is empty')
      return src
    })
    .then(transpile)
}

const compileStdin = () =>
  getStdin().then(transpile).then(php => `<?php\n${php}?>`)

const ts = () => new Date().toISOString().substr(0, 16).replace('T', ' ')

const fileModified = path =>
  fs.stat(path).then(stats => stats.mtime.getTime(), () => 0)

const needsCompile = forced
  ? () => Promise.resolve(true)
  : (srcFilePath, outFilePath) =>
      Promise.all([fileModified(srcFilePath), fileModified(outFilePath)]).then(
        ([srcTime, outTime]) => srcTime > outTime
      )

const updateFile = srcFilePath => {
  const outFilePath = srcFilePath.replace(/[.]piff$/, '.php')

  return needsCompile(srcFilePath, outFilePath).then(needed => {
    if (!needed) {
      console.log(ts(), 'skipped', srcFilePath)
      return
    }

    return compileFile(srcFilePath)
      .then(phpCode => fs.writeFile(outFilePath, phpCode))
      .then(() => {
        console.log(ts(), 'updated', outFilePath)
      })
      .catch(err => {
        complainAboutSyntax(srcFilePath, err)
      })
  })
}

const formatFile = path => {
  console.log(ts(), 'formatting', path)
  return fs
    .readFile(path, 'utf-8')
    .then(src => {
      if (!src) throw new Error('src is empty')
      return src
    })
    .then(src => format(src))
    .then(formatted =>
      fs.writeFile(path, formatted, 'utf-8').catch(err => {
        console.error('ERROR: unable to save formatted piff')
      })
    )
}

const complainAboutSyntax = (srcFilePath, err) => {
  return fs.readFile(srcFilePath, 'utf-8').then(code => {
    let lineNumber = err.location.start.line
    let columnNumber = err.location.start.column

    let line = Lazy(code).split('\n').skip(lineNumber - 1).first()
    console.error('Syntax Error', srcFilePath, 'line', lineNumber)
    console.error(line)
    console.error(Array(columnNumber).join(' ') + '^')
    console.error()
  })
}

function run () {
  if (!process.stdin.isTTY) return compileStdin().then(console.log)

  return Promise.all(
    argv._.map(pattern =>
      fs
        .stat(pattern)
        .then(
          stat =>
            (stat.isDirectory()
              ? pattern.replace(/\/$/, '') + '/**/*.piff'
              : pattern)
        )
    )
  ).then(srcPatterns => {
    if (watching) {
      return watchPatterns(srcPatterns)
    }

    if (formatting) {
      return formatPatterns(srcPatterns)
    }

    return compilePatterns(srcPatterns)
  })
}

function watchPatterns (patterns) {
  const watcher = watch(patterns, {
    ignoreInitial: false,
    delay: 50,
    ignored: IGNORED_DIRS
  })

  watcher.on('change', srcFilePath => {
    if (srcFilePath.match(/[.]piff$/)) {
      // Need to delay to work around a timing issue with how vscode does its saves.
      // It appears that it truncates the file, then appends to it.
      setTimeout(() => updateFile(srcFilePath, true), 50)
    }
  })

  watcher.on('add', srcFilePath => {
    if (srcFilePath.match(/[.]piff$/)) {
      updateFile(srcFilePath)
    }
  })

  console.log(ts() + ' watching ' + patterns.join(' '))
}

function compilePatterns (patterns) {
  // Compile all app files in the src directory
  return Promise.all(
    patterns.map(pattern => {
      return new Promise((resolve, reject) => {
        glob(pattern, (err, srcFiles) => {
          if (err) return reject(err)

          resolve(srcFiles)
        })
      })
    })
  )
    .then(result => Lazy(result).flatten().toArray())
    .then(srcFiles => {
      return eachSeries(srcFiles, f =>
        updateFile(f).catch(err => {
          console.error(err)
          resolve()
        })
      )
    })
}

function formatPatterns (patterns) {
  // Compile all app files in the src directory
  return Promise.all(
    patterns.map(pattern => {
      return new Promise((resolve, reject) => {
        glob(pattern, (err, srcFiles) => {
          if (err) return reject(err)

          resolve(srcFiles)
        })
      })
    })
  )
    .then(result => Lazy(result).flatten().toArray())
    .then(srcFiles => {
      return eachSeries(srcFiles, f =>
        formatFile(f).catch(err => {
          console.error(err)
          resolve()
        })
      )
    })
}

Promise.resolve().then(run).catch(err => {
  console.error(err.message)
  process.exit(1)
})
