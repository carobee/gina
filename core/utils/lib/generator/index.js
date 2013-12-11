/* Geena.Utils.Generator
 *
 * This file is part of the geena package.
 * Copyright (c) 2009-2013 Rhinostone <geena@rhinostone.com>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */
var Generator;

var fs = require('fs');

/**
 * @class Generator
 *
 * Generator Class
 *
 * @package     Geena.Utils
 * @namespace   Geena.Utils.Generator
 * @author      Rhinostone <geena@rhinostone.com>
 * */
Generator = {
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
                if (err) throw err;
                //Setting permission.
                fs.chmodSync(target, 0755);
                log("Geena's command line tool installed.");
                callback = function(){return true};
            });
        });
    },
    createFoldersFromStructureSync : function(structure){

    }
};

module.exports = Generator;