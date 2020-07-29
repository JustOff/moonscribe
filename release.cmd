@echo off
set VER=1.0.3

sed -i -b -E "s/\"version\": \".+?\"/\"version\": \"%VER%\"/" package.json
sed -i -b -E "s/version>.+?</version>%VER%</; s/download\/.+?\/moonscribe-.+?\.xpi/download\/%VER%\/moonscribe-%VER%\.xpi/" update.xml

del bootstrap.js install.rdf
if exist moonscribe.xpi del moonscribe.xpi
call jpm xpi

7z x moonscribe.xpi bootstrap.js install.rdf
if exist moonscribe-%VER%.xpi del moonscribe-%VER%.xpi
ren moonscribe.xpi moonscribe-%VER%.xpi
