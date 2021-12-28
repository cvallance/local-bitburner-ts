To start the local web server and ts build
```
npm run watch
```

To kick off inside bitburner:
```
wget http://localhost:3000/sync.js sync.js
run sync.js
```

To test
```
run testing.js
```

Once all this is running you edit and add scripts to `src/scripts` and they should get automatically built and sync'd across to your game as long as you're running `sync.js`.