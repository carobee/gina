/*
 * This file is part of the gina package.
 * Copyright (c) 2015 Rhinostone <gina@rhinostone.com>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * Gina Core Bootstrap
 *
 * @package    Gina
 * @author     Rhinostone <gina@rhinostone.com>
 */

var gna     = {core:{}};
var fs      = require('fs');
var Config  = require('./config');
var config  = null;
var utils   = require('./utils');

var console = utils.logger;
var Proc    = utils.Proc;
var modelUtil = new utils.Model();
var EventEmitter = require('events').EventEmitter;
var e = new EventEmitter();
gna.initialized = process.initialized = false;
gna.routed = process.routed = false;
gna.utils = utils;
setContext('gina.utils', utils);
var Server  = require('./server');//TODO require('./server').http


// BO cooking..
var startWithGina = false;
//copy & backup for utils/cmd/app.js.
var tmp = process.argv;

// filter $ node.. o $ gina  with or without env
if (process.argv.length >= 4) {
    startWithGina = true;

    try {
        setContext('paths', JSON.parse(tmp[3]).paths);//And so on if you need to.
        setContext('processList', JSON.parse(tmp[3]).processList);
        setContext('ginaProcess', JSON.parse(tmp[3]).ginaProcess);
        //Cleaning process argv.
        process.argv.splice(3);
    } catch (err) {}

    //if (process.argv[1] == 'gina' || process.argv[1] == _( getPath('root') + '/gina') ) {
    //}
}
tmp = null;

setPath( 'node', _(process.argv[0]) );
var root = getPath('root');

gna.executionPath = root;

var ginaPath = getPath('gina.core');
if ( typeof(ginaPath) == 'undefined') {
    ginaPath = _(__dirname);
    setPath('gina.core', ginaPath);
}

setContext('gina.utils', utils);

var envs = ['dev', 'debug', 'stage', 'prod'];
var protocols = ['http', 'https']; // will support https for the 0.0.10
var env;
//Setting env.
if ( !process.env.NODE_ENV ) {
    env =  ( typeof(process.argv[2]) != 'undefined')  ? process.argv[2].toLowerCase() : 'prod';
} else {
    env = process.env.NODE_ENV
}

gna.env = process.env.NODE_ENV = env;

//gna.env.isWin32 = process.env.isWin32 = function() {
//    return (os.platform() == 'win32') ? true : false;
//};
gna.env.isWin32 = process.env.isWin32 = isWin32

//Cahceless is also defined in the main config : Config::isCacheless().
process.env.IS_CACHELESS = (env == "dev" || env == "debug") ? true : false;

//console.log('ENV => ', env);
//console.log('HOW  ', process.argv.length, process.argv);

var bundlesPath = getPath('mountPath');

var p = new _(process.argv[1]).toUnixStyle().split("/");
var isSym = false;
var path;

var isPath = (/\//).test(process.argv[1]) || (/\\/).test(process.argv[1]);
if (!isPath) {
    //lequel ?
    try {
        isSym = fs.lstatSync( _(bundlesPath +'/'+ process.argv[1]) ).isSymbolicLink();
    } catch (err) {
        //Did not find it ^^.
    }
} else {
    process.argv[1] = _(process.argv[1]);
}


// Todo - load from env.json or locals  or project.json ??

var abort = function(err) {
    if (
        process.argv[2] == '-s' && startWithGina
            || process.argv[2] == '--start' && startWithGina
            //Avoid -h, -v  ....
            || !startWithGina && isPath && process.argv.length > 3

        ) {
        if (isPath && !startWithGina) {
            console.log('You are trying to load gina by hand: just make sure that your env ['+env+'] matches the given path ['+ path +']');
        } else if ( typeof(err.stack) != 'undefined' ) {
            console.log('Gina could not determine which bundle to load: ' + err +' ['+env+']' + '\n' + err.stack);
        } else {
            console.log('Gina could not determine which bundle to load: ' + err +' ['+env+']');
        }
        process.exit(1);
    }
};

/**
 * Get project conf from project.json
 *
 *
 * @param {function} callback
 * @return {object} data - Result conf object
 * */
gna.getProjectConfiguration = function (callback){

    var modulesPackage = _(root + '/project.json');
    var project = {};

    //Merging with existing;
    if ( fs.existsSync(modulesPackage) ) {
        try {

            var dep = require(modulesPackage);
            //console.log('ENV: ', env );
            //console.log('PROCESS: ', process.argv );
            //console.log(" now loading....", modulesPackage);
            //console.log('content ', dep);
            if ( typeof(dep['bundles']) == "undefined") {
                dep['bundles'] = {};
            }

            if (
                typeof(dep['bundles']) != "undefined"
                    && typeof(project['bundles']) != "undefined"
                ) {

                for (var d in dep) {

                    if (d == 'bundles')
                        for (var p in dep[d]) project['bundles'][p] = dep['bundles'][p];
                    else
                        project[d] = dep[d];

                }
            } else {
                project = dep;
            }
            gna.project = project;
            callback(false, project);
        } catch (err) {
            gna.project = project;
            callback(err);
        }

    } else {
        console.warn('missing project ???');
        gna.project = project;
        callback(false, project);
    }
};

/**
 * mount release => bundle
 * @param {string} source
 * @param {string} target
 * @param {string} type
 *
 * @callback callback
 * @param {boolean|string} err
 * */
gna.mount = process.mount = function(bundlesPath, source, target, type, callback){
    if ( typeof(type) == 'function') {
        var callback = type;
        type = 'dir';
    }
    //creating folders.
    //use junction when using Win XP os.release == '5.1.2600'
    var exists = fs.existsSync(source);
    console.debug('source: ', source);
    console.debug('checking before mounting ', target, fs.existsSync(target), bundlesPath);
    if ( fs.existsSync(target) ) {
        try {
            fs.unlinkSync(target)
        } catch (err) {
            callback(err)
        }
    }
    if ( exists ) {
        //will override existing each time you restart.
        var pathToMount = utils.generator.createPathSync(bundlesPath, function onPathCreated(err){
            if (!err) {
                try {
                    if ( type != undefined)
                        fs.symlinkSync(source, target, type)
                    else
                        fs.symlinkSync(source, target);

                    callback(false)
                } catch (err) {
                    if (err) {
                        console.emerg(err.stack||err.message);
                        process.exit(1)
                    }
                    if ( fs.existsSync(target) ) {
                        var stats = fs.lstatSync(target);
                        if ( stats.isDirectory() ) {
                            var d = new _(target).rm( function(err){
                                callback(err);
                            })
                        } else {
                            fs.unlinkSync(target);
                            callback(err)
                        }
                    }
                }
            } else {
                console.error(err);
                callback(err)
            }
        });
    } else {
        // Means that it did not find the release. Build and re mount.
        callback('Found no release to mount for: ', source)
    }
};

var mountChildrenSync = function(project, bundles, i) {
    var i           = i || 1; // ignoring startingApp (master)
    if (i > bundles.length -1) {
        return
    }
    var source    = (env == 'dev' || env == 'debug') ? _( root +'/'+project.bundles[bundles[i]].src) : _( root +'/'+ project.bundles[bundles[i]].release.target )
        , target    = _( root +'/'+ project.bundles[bundles[i]].release.link )
        , type      = 'dir';




    if ( fs.existsSync(target) ) {
        try {
            fs.unlinkSync(target)
        } catch (err) {
            console.emerg(err.stack);
            process.exit(1)
        }
    }

    if ( fs.existsSync(source) ) {
        utils.generator.createPathSync(bundlesPath, function onPathCreated(err){
            if (!err) {
                // cleanning first
                var list    = fs.readdirSync(bundlesPath)
                    , f     = 0
                    , len   = list.length
                    , fPath = null;

                for (; f < len; ++f) {
                    fPath = _(bundlesPath + '/'+ list[f], true)
                    if ( !/^\./.test(fPath) ) {
                        fs.unlinkSync( fPath )
                    }
                }
                // mount
                try {
                    if ( type != undefined)
                        fs.symlinkSync(source, target, type)
                    else
                        fs.symlinkSync(source, target);

                    mountChildrenSync(project, bundles, i+1)

                } catch (err) {
                    console.emerg(err.stack||err.message);
                    process.exit(1)
                }

            } else {
                console.error(err.stack);
                process.exit(1)
            }
        });
    } else {
        console.emerg( new Error('Found no release to mount for: '+ source).stack)
    }
}


// get configuration
gna.getProjectConfiguration( function onGettingProjectConfig(err, project) {

    if (err) console.error(err.stack);

    var appName, path;

    var packs = project.bundles;
    if (startWithGina) {
        if (!isPath) {
            appName = getContext('bundle');
            if ( typeof(packs[appName].release.version) == 'undefined' && typeof(packs[appName].tag) != 'undefined') {
                packs[appName].release.version = packs[appName].tag
            }
            packs[appName].release.target = 'releases/'+ appName +'/' + env +'/'+ packs[appName].release.version;
            path = (env == 'dev' || env == 'debug') ? packs[appName].src : packs[appName].release.target
        } else {
            path = _(process.argv[1])
        }
    } else {
        path = _(process.argv[1])
    }



    path = path.replace(root + '/', '');
    var search;
    if ( (/index.js/).test(path) || p[p.length-1] == 'index') {
        var self;
        path = ( self = path.split('/') ).splice(0, self.length-1).join('/')
    }

    try {
        //finding app.
        var target, source, tmp;
        for (var bundle in packs) {
            //is bundle ?
            tmp = "";
            if (
                typeof(packs[bundle].release) != 'undefined' && env == 'prod'
                    || typeof(packs[bundle].release) != 'undefined' && env == 'stage'
                ) {


                if ( typeof(packs[bundle].release.version) == 'undefined' && typeof(packs[bundle].tag) != 'undefined') {
                    packs[bundle].release.version = packs[bundle].tag
                }
                packs[bundle].release.target = 'releases/'+ bundle +'/' + env +'/'+ packs[bundle].release.version;
                tmp = packs[bundle].release.target.replace(/\//g, '').replace(/\\/g, '');

                if ( !appName && tmp == path.replace(/\//g, '').replace(/\\/g, '') ) {
                    appName = bundle;
                    break
                }
            } else if (
                typeof(packs[bundle].src) != 'undefined' && env == 'dev'
                    || typeof(packs[bundle].src) != 'undefined' && env == 'debug'
                ) {

                tmp = packs[bundle].src.replace(/\//g, '').replace(/\\/g, '');
                if ( tmp == path.replace(/\//g, '').replace(/\\/g, '') ) {
                    appName = bundle;
                    break
                }
            } else {
                abort('Path mismatched with env: ' + path)
            }
            // else, not a bundle
        }

        if (appName == undefined) {
            setContext('bundle', undefined);
            abort('No bundle found for path: ' + path)
        } else {
            setContext('bundle', appName);
            //to remove after merging gina processes into a single process.
            var processList = getContext('processList');
            process.list = processList;
            var bundleProcess = new Proc(appName, process);
            bundleProcess.register(appName, process.pid)
        }

    } catch (err) {
        abort(err)
    }

    /**
     * On middleware initialization
     *
     * @callback callback
     *
     * */
    gna.onInitialize = process.onInitialize = function(callback) {

        gna.initialized = true;
        e.once('init', function(instance, middleware, conf) {
            var configuration = config.getInstance();
            modelUtil.loadAllModels(
                conf.bundles,
                configuration,
                env,
                function() {
                    joinContext(conf.contexts);
                    gna.getConfig = function(name){
                        var tmp = "";
                        if ( typeof(name) != 'undefined' ) {
                            try {
                                //Protect it.
                                tmp = JSON.stringify(conf.content[name]);
                                console.warn("parsing ", conf.content);
                                return JSON.parse(tmp)
                            } catch (err) {
                                console.error(err.stack);
                                return undefined
                            }
                        } else {
                            //console.error("config!!!! ", conf);
                            tmp = JSON.stringify(conf);
                            return JSON.parse(tmp)
                        }
                    };
                    try {
                        //configureMiddleware(instance, express); // no, no and no...
                        callback(e, instance, middleware)
                    } catch (err) {
                        // TODO Output this to the error logger.
                        console.error('Could not complete initialization: ', err.stack)
                    }

                })// EO modelUtil

        })
    }

    gna.onRouting = process.onRouting = function(callback) {

        gna.routed = true;
        e.once('route', function(request, response, next, params) {

            try {
                callback(e, request, response, next, params)
            } catch (err) {
                // TODO Output this to the error logger.
                console.error('Could not complete routing: ', err.stack)
            }
        })
    }

    gna.getShutdownConnector = process.getShutdownConnector = function(callback) {
        var connPath = _(bundlesPath +'/'+ appName + '/config/connector.json');
        fs.readFile(connPath, function onRead(err, content) {
            try {
                callback(err, JSON.parse(content).httpClient.shutdown)
            } catch (err) {
                callback(err)
            }
        })
    }

    gna.getShutdownConnectorSync = process.getShutdownConnectorSync = function() {
        var connPath = _(bundlesPath +'/'+ appName + '/config/connector.json');
        try {
            var content = fs.readFileSync(connPath);
            return JSON.parse(content).httpClient.shutdown
        } catch (err) {
            return undefined
        }
    }

    gna.getMountedBundles = process.getMountedBundles = function(callback) {
        fs.readdir(bundlesPath, function onRead(err, files) {
            callback(err, files)
        })
    }

    gna.getMountedBundlesSync = process.getMountedBundlesSync = function() {
        try {
            return fs.readdirSync(bundlesPath)
        } catch (err) {
            return err.stack
        }
    }

    gna.getRunningBundlesSync = process.getRunningBundlesSync = function() {

        //TODO - Do that thru IPC or thru socket. ???
        var pidPath = _(getPath('globalTmpPath') +'/pid');
        var files = fs.readdirSync(pidPath);

        var name = '';
        var indexTmp = null;

        var content = [];
        var contentGina = [];
        var shutdown = [];
        var shutdownGina = [];

        var bundleGinaPid = getContext('ginaProcess');

        //Sort Bundle / Gina instance to get a array [BUNDLE,GINA,SHUTDOWN,GINASHUTDOWN].
        for (var f=0; f<files.length; ++f) {

            name = fs.readFileSync( _(pidPath +'/'+ files[f]) ).toString();

            if ( name == "shutdown" ) {
                shutdown[0] = {};
                shutdown[0]['pid']  = files[f];
                shutdown[0]['name'] = name;
                shutdown[0]['path'] = _(pidPath +'/'+ files[f]);
            } else if ( files[f] == bundleGinaPid ){
                shutdownGina[0] = {};
                shutdownGina[0]['pid']  = files[f];
                shutdownGina[0]['name'] = name;
                shutdownGina[0]['path'] = _(pidPath +'/'+ files[f]);
            } else if ( name == "gina" ) {
                indexTmp = contentGina.length;
                contentGina[indexTmp] = {};
                contentGina[indexTmp]['pid']  = files[f];
                contentGina[indexTmp]['name'] = name;
                contentGina[indexTmp]['path'] = _(pidPath +'/'+ files[f]);
            } else {
                indexTmp = content.length;
                content[indexTmp] = {};
                content[indexTmp]['pid']  = files[f];
                content[indexTmp]['name'] = name;
                content[indexTmp]['path'] = _(pidPath +'/'+ files[f]);
            }
        }

        //Remove GINA instance, avoid killing gina bundle before/while bundle is remove.
        //Bundle kill/remove gina instance himself.
        //content = content.concat(contentGina);
        content = content.concat(shutdown);
        content = content.concat(shutdownGina);

        return content
    }

    gna.getVersion = process.getVersion = function(bundle) {
        var name = bundle || appName;
        name = name.replace(/gina: /, '');

        if ( name != undefined) {
            try {
                var str = fs.readFileSync( _(bundlesPath + '/' + bundle + '/config/app.json') ).toString();
                var version = JSON.parse(str).version;
                return version
            } catch (err) {
                return err
            }
        } else {
            return undefined
        }
    }

    /**
     * Start server
     *
     * @param {string} [executionPath]
     * */
    gna.start = process.start = function() { //TODO - Add protocol in arguments

        var core    = gna.core;
        //Get bundle name.
        console.log('appName ', appName);
        core.startingApp = appName;
        core.executionPath =  root;
        core.ginaPath = ginaPath;


        //Inherits parent (gina) context.
        if ( typeof(process.argv[3]) != 'undefined' ) {
            setContext( JSON.parse(process.argv[3]) )
        }


        //check here for mount point source...
        if ( typeof(project.bundles[core.startingApp].release.version) == 'undefined' && typeof(project.bundles[core.startingApp].tag) != 'undefined') {
            project.bundles[core.startingApp].release.version = project.bundles[core.startingApp].tag
        }
        project.bundles[core.startingApp].release.target = 'releases/'+ core.startingApp +'/' + env +'/'+ project.bundles[core.startingApp].release.version;

        var source = (env == 'dev' || env == 'debug') ? _( root +'/'+project.bundles[core.startingApp].src) : _( root +'/'+ project.bundles[core.startingApp].release.target );
        var tmpSource = _(bundlesPath +'/'+ core.startingApp);

        var linkPath =  _( root +'/'+ project.bundles[core.startingApp].release.link );

        gna.mount( bundlesPath, source, linkPath, function onBundleMounted(mountErr) {
            if (mountErr) {
                console.error(mountErr.stack);
                process.exit(1)
            }
            config = new Config({
                env             : env,
                executionPath   : core.executionPath,
                startingApp     : core.startingApp,
                ginaPath        : core.ginaPath
            });

            setContext('gina.config', config);
            config.onReady( function(err, obj){

                if (err) console.error(err, err.stack);

                var initialize = function(err, instance, middleware, conf) {
                    if (!err) {

                        //On user conf complete.
                        e.on('complete', function(instance){
                            // ( !isStandalone || isStandalone && isMaster )
                            server.start(instance)
                        });


                        if (!mountErr) {
                            // -- BO
                            e.emit('init', instance, middleware, conf);
                            //In case there is no user init.
                            if (!gna.initialized) {
                                e.emit('complete', instance);
                            }

                            console.debug('[ '+core.startingApp+' ] mounted!! ', conf.bundle, process.pid)
                            // -- EO
                        } else {
                            console.error( 'Could not mount bundle ' + core.startingApp + '. ' + 'Could not mount bundle ' + core.startingApp + '. ' + (err.stack||err.message));

                            abort(err)
                        }

                    } else {
                        console.error(err.stack||err.message)
                    }
                };

                var isStandalone = obj.isStandalone;
                var opt = {
                    bundle          : core.startingApp,
                    //Apps list.
                    bundles         : obj.bundles,
                    allBundles      : obj.allBundles,
                    env             : obj.env,
                    isStandalone    : isStandalone,
                    executionPath   : core.executionPath,
                    conf            : obj.conf
                };


                if (isStandalone && obj.bundles.length > 1) {
                    // mount child as well
                    mountChildrenSync(project, obj.bundles);
                }

                var server = new Server(opt);
                server.onConfigured(initialize);

            })//EO config.
        })//EO mount.
    }

    /**
     * Stop server
     * */
    gna.stop = process.stop = function(pid, code) {
        console.log("stoped server");
        if(typeof(code) != "undefined")
            process.exit(code);

        process.exit()
    }

    /**
     * Get Status
     * */
    gna.status = process.status = function(bundle) {
        console.log("getting server status")
    }
    /**
     * Restart server
     * */
    gna.restart = process.restart = function() {
        console.log("starting server")
    }


});//EO onDoneGettingProjectConfiguration.

module.exports = gna