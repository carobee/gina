/* Gina.Utils.Generator
 *
 * This file is part of the gina package.
 * Copyright (c) 2015 Rhinostone <gina@rhinostone.com>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var fs = require('fs');

/**
 * @class Generator
 *
 * Generator Class
 *
 * @package     Gina.Utils
 * @namespace   Gina.Utils.Generator
 * @author      Rhinostone <gina@rhinostone.com>
 * */
var Generator = {
    createFileFromTemplate : function(source, target, callback){

        fs.readFile(source, function(err, data){
            if (err) throw err;
            //Removing existing files.
            if(fs.existsSync(target)){
                //Just in case.
                fs.chmodSync(target, 0755);
                fs.unlink(target);
            }
            fs.writeFile(target, data, function(err, data){
                setTimeout( function onChmod(){
                    if (err) throw err;
                    //Setting permission.
                    fs.chmodSync(target, 0755);
                    if ( typeof(callback) != 'undefined') callback(err)
                }, 1000)
            });
        });
    },
    createFoldersFromStructureSync : function(structure){

    },
    createPathSync : function(path, callback) {
        var t = path.replace(/\\/g, '\/').split('/');
        var path = '';
        //creating folders
        try {
            for (var p=0; p<t.length; ++p) {
                if (process.platform == 'win32' && p === 0) {
                    path += t[p];
                } else {
                    path += '/' + t[p];
                }
                if ( !fs.existsSync(path) ) {
                    fs.mkdirSync(path);
                }
            }
            callback(false);
        } catch (err) {
            callback(err);
        }
    }
};

module.exports = Generator