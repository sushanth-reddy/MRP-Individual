'use strict';

import Config from './config.js';

let MRP = {
    client: null,
    patient: null,
    reconciledMeds: [],
    measureList:[],
}

MRP.getRandomInt = (min, max) => {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

MRP.getGUID = () => {
    let s4 = () => {
    return Math.floor((1 + Math.random()) * 0x10000)
                .toString(16)
                .substring(1);
    };
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
}

MRP.now = () => {
    let date = new Date();
    return date.toISOString();
}

MRP.displayPatient = (pt) => {
    $('#medrec-name, #review-name').html(MRP.getPatientName(pt));
}

MRP.displayScreen = (screenID) => {
    // TODO: add transitions and other eye candy
    let screens = ['intro-screen','medrec-screen','review-screen','confirm-screen','config-screen','error-screen'];
    for (let s of screens) {
        $('#'+s).hide();
    }
    $('#'+screenID).show();
}

MRP.displayIntroScreen = () => {
    MRP.displayScreen('intro-screen');
}

MRP.displayMedRecScreen = () => {
    MRP.displayScreen('medrec-screen');
}

MRP.displayConfirmScreen = () => {
    MRP.displayScreen('confirm-screen');
}

MRP.displayConfigScreen = () => {
    if (Config.configSetting === "custom") {
        $('#config-select').val("custom");
    } else {
        $('#config-select').val(Config.configSetting);
    }
    $('#config-text').val(JSON.stringify(Config.payerEndpoint, null, 2));
    MRP.displayScreen('config-screen');
}

MRP.displayReviewScreen = () => {
    $("#final-list").empty();
    Config.newListResource.entry = [];
    let meds = MRP.reconciledMeds
                    .sort((a,b) => a.name >= b.name)
                    .filter((a) => a.status === "active");

    for (let med of meds) {
        if ($('#' + med.id).val() === "active") {
            Config.newListResource.entry.push ({
                "item": {
                    "reference": "MedicationRequest/" + med.id
                }
            });
            $("#final-list").append("<tr><td class='medtd'>" + med.name + 
                                    "</td><td>" + med.dosage +
                                    "</td><td>" + med.route + "</td></tr>");
        }
    }

    MRP.displayScreen('review-screen');
}

MRP.displayErrorScreen = (title, message) => {
    $('#error-title').html(title);
    $('#error-message').html(message);
    MRP.displayScreen('error-screen');
}

MRP.disable = (id) => {
    $("#"+id).prop("disabled",true);
}

MRP.getPatientName = (pt) => {
    if (pt.name) {
        let names = pt.name.map((n) => n.given.join(" ") + " " + n.family);
        return names.join(" / ");
    } else {
        return "anonymous";
    }
}

MRP.getMedicationName = (medCodings) => {
    let coding = medCodings.find((c) => c.system == "http://www.nlm.nih.gov/research/umls/rxnorm");
    return coding && coding.display || "Unnamed Medication(TM)";
}

MRP.generatePayload = (patientResource, practitionerResource, organizationResource, locationResource, coverageResource, payorResource) => {
    let timestamp = MRP.now();
    let measurereport = Config.operationPayload.parameter.find(e => e.name === "measure-report");

    // TODO: consider generating using descrete templates instead of extracting from sample
    let task = Config.operationPayload.parameter.find(e => e.name === "resource" && e.resource.resourceType === "Task");
    let patient = Config.operationPayload.parameter.find(e => e.name === "resource" && e.resource.resourceType === "Patient");
    let location = Config.operationPayload.parameter.find(e => e.name === "resource" && e.resource.resourceType === "Location");
    let practitioner = Config.operationPayload.parameter.find(e => e.name === "resource" && e.resource.resourceType === "Practitioner");
    let organization = Config.operationPayload.parameter.find(e => e.name === "resource" && e.resource.resourceType === "Organization");
    let encounter = Config.operationPayload.parameter.find(e => e.name === "resource" && e.resource.resourceType === "Encounter");
    let coverage = Config.operationPayload.parameter.find(e => e.name === "resource" && e.resource.resourceType === "Coverage");
    let payor = {
            "name": "resource",
            "resource": payorResource
        };

    Config.operationPayload.id = MRP.getGUID();
    measurereport.resource.id = MRP.getGUID();
    task.resource.id = MRP.getGUID();
    encounter.resource.id = MRP.getGUID();

    patient.resource = patientResource;
    practitioner.resource = practitionerResource;
    organization.resource = organizationResource;
    location.resource = locationResource;
    coverage.resource = coverageResource;

    // TODO: look into a more elegant resource generation approach
    measurereport.resource.patient.reference = "Patient/" + patient.resource.id;
    measurereport.resource.date = timestamp;
    measurereport.resource.period.start = timestamp;
    measurereport.resource.period.end = timestamp;
    measurereport.resource.measure.reference = Config.measure;
    measurereport.resource.reportingOrganization.reference = "Organization/" + organization.resource.id;
    measurereport.resource.evaluatedResources.extension[0].valueReference.reference = "Task/" + task.resource.id;
    task.resource.for.reference = "Patient/" + patient.resource.id;
    task.resource.context.reference = "Encounter/" + encounter.resource.id;
    task.resource.authoredOn = timestamp;
    task.resource.executionPeriod.start = timestamp;
    task.resource.executionPeriod.end = timestamp;
    task.resource.owner.reference = "Practitioner/" + practitioner.resource.id;
    encounter.resource.period.start = timestamp;
    encounter.resource.period.end = timestamp;
    encounter.resource.subject.reference = "Patient/" + patient.resource.id;
    encounter.resource.location[0].location.reference = "Location/" + location.resource.id;
    encounter.resource.participant[0].individual.reference = "Practitioner/" + practitioner.resource.id;
    encounter.resource.serviceProvider.reference = "Organization/" + organization.resource.id;
    patient.resource.managingOrganization.reference = "Organization/" + organization.resource.id;
    coverage.resource.policyHolder.reference = "Patient/" + patient.resource.id;
    coverage.resource.subscriber.reference = "Patient/" + patient.resource.id;
    coverage.resource.beneficiary.reference = "Patient/" + patient.resource.id;

    if (! $('#chk-post-discharge').is(':checked')) {
        task.resource.code.coding = [Config.postDischargeReconciliationCoding];
    }

    Config.operationPayload.parameter = [measurereport, task, patient, location, practitioner, organization, encounter, coverage, payor];

    return Config.operationPayload;
}

MRP.loadData = async (client) => {
    console.log(client,'client2222')
    try {
        MRP.client = client;
        console.log(MRP.client,'police')
        let pid = MRP.client.patient.id;
        // let slists = Config.scenarios[pid].lists;

        // $('#scenario-intro').html(Config.scenarios[pid].description);
        // MRP.displayIntroScreen();
        MRP.displayMedRecScreen();
        
        console.log(MRP.client.patient.read().then((pat)=>{console.log(pat,'car')}),'train')
        MRP.client.patient.read().then((pt) => {
            console.log(pt,'ptt')
            MRP.patient = pt;
            MRP.displayPatient (pt);
        });
        console.log(MRP,'MRp')
        let slists =["list01", "list02"]

        let lists = await MRP.client.patient.api.fetchAll(
            { type: "List", query: {_id:slists.join(",") }}
        );
        await MRP.loadMeasures(client);
        let medPromises = [];
        for (let l of lists) {
            $('#medrec-lists').append("<h4>" + l.title + " - " + l.date + "</h4>" +
                                "<p><div class='dvt'><table class='table'><thead><tr>" +
                                "<th>Medication</th><th>Dosage</th><th>Route</th><th>Status</th>" +
                                "</tr></thead><tbody id='" + l.id + "'></tbody></table></div></p>");
            if (l.entry) {
                let promises = l.entry.map((e) => {
                    let medID = e.item.reference.split("/")[1];
                    return (async (medID) => {
                        let r = await MRP.client.patient.api.read({
                            type: "MedicationRequest", 
                            id: medID
                        });
                        return {
                            res: r,
                            lid: l.id
                        };
                    })(medID);
                });
                medPromises = medPromises.concat(promises);   
            } 
        }

        let res = await Promise.all(medPromises);
    
        for (let r of res) {
            let med = r.res.data;
            console.log('hereeee')
            let medName = MRP.getMedicationName(med.medicationCodeableConcept.coding);
            let dosage = med.dosageInstruction[0].text; // TODO: Construct dosage from structured SIG
            console.log('log')
            let routeCode = med.dosageInstruction[0].route.coding[0]; // TODO: do not assume first dosageInstruction, coding, etc is relevant (throughout the app)
            let route = (routeCode.system === "http://snomed.info/sct" && routeCode.code === "26643006") ? "oral" : "other";
            // let status = med.status; // TODO: Make use of status
            let medid = med.id;
            MRP.reconciledMeds.push ({name: medName, id:medid, dosage: dosage, route: route, status:"active"});
            // TODO: consider changing medid to something like listid+medid for better collision avoidance
            $('#' + r.lid).append("<tr><td class='medtd'>" + medName + "</td><td>" + dosage + "</td><td>" + 
                                route + "</td><td><select class='custom-select' id='" + 
                                medid + "'><option value='active'>Active</option>" +
                                "<option value='stop'>Stop</option><option value='hold'>On-hold</option>" +
                                "</select></td></tr>");
        }

        $("#spinner").hide();
        $("#medrec-meds").show();
        MRP.displayMedRecScreen();
    } catch (err) {
        console.log (err);
        MRP.displayErrorScreen("Failed to initialize scenario", "Please make sure to launch the app with one of the following sample patients: " + Object.keys(Config.scenarios).join(", "));
    }
}



MRP.loadMeasures = async (client) => {
    try {
        client.api.fetchAll(
            {type: "Measure"}
        ).then(function (results) {
            // $('#').empty();
            MRP.measureList = results;
            results.forEach((measure) => {
                $('#measure-select').append("<option value="+measure.id+">"+measure.title+"</option>")

            });
        });
    } catch (err) {
        MRP.displayErrorScreen("Failed to get measures", "Please make sure that everything is OK with request configuration");
    }
}


MRP.reconcile = async () => {
    let timestamp = MRP.now();

    $('#discharge-selection').hide();
    MRP.disable('btn-submit');
    MRP.disable('btn-edit');
    $('#btn-submit').html("<i class='fa fa-circle-o-notch fa-spin'></i> Submit reconciled medications");
    console.log(MRP.patient,'patient organization')
    let orgID = MRP.patient.managingOrganization.reference.split('/')[1];
    let libDR = {
        "resourceType" : "Library",
        "status":"active",
        "type":{
           "coding":[
              {
                 "code":"module-definition"
              }
           ]
        },
        "relatedArtifact":[
           {
              "type":"depends-on",
              "resource":{
                 "reference":"http://hl7.org/fhir/us/hedis/Library/library-mrp-logic"
              }
           }
        ],
        "dataRequirement":[
           {
              "type":"MeasureReport",
              "profile":[
                 "http://hl7.org/fhir/us/davinci-deqm/STU3/StructureDefinition/measurereport-deqm"
              ]
           },
           {
              "type":"Patient",
              "profile":[
                 "http://hl7.org/fhir/us/qicore/StructureDefinition/qicore-patient"
              ]
           },
           {
              "type":"Coverage",
              "profile":[
                 "http://hl7.org/fhir/us/qicore/StructureDefinition/qicore-encounter"
              ]
           },
           {
              "type":"Location",
              "profile":[
                 "http://hl7.org/fhir/us/qicore/StructureDefinition/qicore-location"
              ]
           },
           {
              "type":"Task",
              "profile":[
                 "http://ncqa.org/fhir/us/hedis/StructureDefinition/hedis-task"
              ]
           },
           {
              "type":"Organization",
              "profile":[
                 "http://hl7.org/fhir/us/davinci-deqm/STU3/StructureDefinition/organization-deqm"
              ]
           },
           {
              "type":"Practitioner",
              "profile":[
                 "http://hl7.org/fhir/us/davinci-deqm/STU3/StructureDefinition/practitioner-deqm"
              ]
           }
        ]
     }
     var dataToLoad = []
     for (var i = 0 ;i<libDR.dataRequirement.length;i++){
        if(libDR.dataRequirement[i].type === 'Practitioner'){
            console.log(MRP.client.user,'user')
            dataToLoad.push(MRP.client.user.read())
        }
        else if(libDR.dataRequirement[i].type === 'Organization'){
            console.log('inside organization if')
            dataToLoad.push(MRP.client.patient.api.read({type: "Organization", id: orgID}))
        }
        else if(libDR.dataRequirement[i].type === 'Location'){
            console.log('inside Lcoation if')
            dataToLoad.push(MRP.client.patient.api.search({type: "Location", query: {organization: orgID}}))
        }
        else if(libDR.dataRequirement[i].type === 'Coverage'){
            console.log('inside Coverage if')
            dataToLoad.push(MRP.client.patient.api.search({type: "Coverage", query: {subscriber: MRP.client.patient.id}}))
        }

        // else if(libDR.dataRequirement[i].type='Location')

     }
    console.log(dataToLoad)
    
    //  let res = await Promise.all([
    //     MRP.client.user.read(),
    //     MRP.client.patient.api.read({type: "Organization", id: orgID}),
    //     MRP.client.patient.api.search({type: "Location", query: {organization: orgID}}),
    //     MRP.client.patient.api.search({type: "Coverage", query: {subscriber: MRP.client.patient.id}})
    // ]);
    let res = await Promise.all(dataToLoad);

    let location = ''
    let coverage = ''
    let organization = ''
    let practitioner = ''
    for(var j =0;j< res.length;j++){
        if('data' in res[j]){
            // var arr = Object.keys(res[j].data)
            // console.log(arr,'arr')
            // if(arr.indexOf('entry') !== -1)
            if('entry' in res[j].data){
                console.log(res[j].data,'poie')
                if(res[j].data.entry[0].resource.resourceType === "Location"){
                    location = res[j].data.entry[0].resource
                }
                else if(res[j].data.entry[0].resource.resourceType === "Coverage"){
                    console.assert (res[j].data.total <= 1, "No more than 1 Coverage resources found");
                    console.assert (res[j].data.total === 1, "Matching Coverage resource found");
                    coverage = res[j].data.entry[0].resource
                }

            }
            else{
                if(res[j].data.resourceType === "Organization"){
                    organization = res[j].data
                    
                }
            }
        }
        else{
            practitioner = res[j]
        }
        
    }
    
    // let practitioner = res[0];
    // let organization = res[1].data;
    // let location = res[2].data.entry[0].resource;
    // let coverage = res[3].data.entry[0].resource;
    let payorOrgID = coverage.payor[0].reference.split('/')[1];
    let payorOrganization = await MRP.client.patient.api.read({type: "Organization", id: payorOrgID});
    let payor = payorOrganization.data;
    console.log(payor,organization,"payor and Organization")
    let payload = MRP.generatePayload(MRP.patient, practitioner, organization, location, coverage, payor);

    // TODO: Generate new MedicationRequests etc
    // TODO: Disable/deprecate source lists and MedicationRequest-s
    // TODO: Review list ID generation scheme
    Config.newListResource.id = "list-" + MRP.getRandomInt (1000,9999);
    Config.newListResource.date = timestamp;
    Config.newListResource.subject.reference = "Patient/" + MRP.client.patient.id;
    $('#confirm-screen p').append(" (" + Config.newListResource.id + ")");

    await MRP.client.patient.api.update({resource: Config.newListResource});

    if (Config.payerEndpoint.type === "secure-smart") {
        sessionStorage.operationPayload = JSON.stringify(payload);
        if (localStorage.tokenResponse) {
            // load state from localStorage
            let state = JSON.parse(localStorage.tokenResponse).state;
            // sessionStorage.tokenResponse = localStorage.tokenResponse;
            sessionStorage[state] = localStorage[state];
            FHIR.oauth2.ready(MRP.initialize);
        } else {
            FHIR.oauth2.authorize({
                "client": {
                    "client_id": Config.payerEndpoint.clientID,
                    "scope":  Config.payerEndpoint.scope
                },
                "server": Config.payerEndpoint.url
            });
        }
    } else {
        MRP.finalize();
    }
}

MRP.initialize = (client) => {
    console.log('firdt print',client)
    MRP.loadConfig();
    // console.log(sessionStorage,'sessionaaaa')
    if (sessionStorage.operationPayload) {
        if (JSON.parse(sessionStorage.tokenResponse).refresh_token) {
            // save state in localStorage
            let state = JSON.parse(sessionStorage.tokenResponse).state;
            localStorage.tokenResponse = sessionStorage.tokenResponse;
            localStorage[state] = sessionStorage[state];
        }
        Config.operationPayload = JSON.parse(sessionStorage.operationPayload);
        Config.payerEndpoint.accessToken = JSON.parse(sessionStorage.tokenResponse).access_token;
        MRP.finalize();
    } else {
        MRP.loadData(client);
    }
}

MRP.measureSelect=() => {
    let selection = $('#measure-select').val();
    console.log(selection,'please work')
    Config.measure = selection
    console.log(Config.measure,'yess')

}
MRP.loadConfig = () => {
    let configText = window.localStorage.getItem("mrp-app-config");
    if (configText) {
        let conf = JSON.parse (configText);
        if (conf['custom']) {
            Config.payerEndpoint = conf['custom'];
            Config.configSetting = "custom";
        } else {
            Config.payerEndpoint = Config.payerEndpoints[conf['selection']];
            Config.configSetting = conf['selection'];
        }
    }
}

MRP.finalize = async () => {
    var config = {
        type: 'POST',
        url: Config.payerEndpoint.url + "/Measure/"+Config.measure+"/$submit-data",
        data: JSON.stringify(Config.operationPayload),
        contentType: "application/fhir+json"
    };

    if (Config.payerEndpoint.type !== "open") {
        config['beforeSend'] = (xhr) => {
            xhr.setRequestHeader ("Authorization", "Bearer " + Config.payerEndpoint.accessToken);
        };
    }

    try {
        await $.ajax(config);
        console.log (JSON.stringify(Config.operationPayload, null, 2));
        MRP.displayConfirmScreen();
    } catch (err) {
        MRP.displayErrorScreen("Measure report submission failed", "Please check the submit endpoint configuration");
    }
}

$('#chk-post-discharge').bootstrapToggle({
    on: 'Yes',
    off: 'No'
});

$('#btn-review').click(MRP.displayReviewScreen);
$('#btn-start').click(MRP.displayMedRecScreen);
$('#btn-edit').click(MRP.displayMedRecScreen);
$('#btn-submit').click(MRP.reconcile);
$('#btn-configuration').click(MRP.displayConfigScreen);
$("#measure-select").click(MRP.measureSelect)
$('#btn-config').click(() => {
    let selection = $('#config-select').val();
    if (selection !== 'custom') {
        window.localStorage.setItem("mrp-app-config", JSON.stringify({'selection': parseInt(selection)}));
    } else {
        let configtext = $('#config-text').val();
        let myconf;
        try {
            myconf = JSON.parse(configtext);
            window.localStorage.setItem("mrp-app-config", JSON.stringify({'custom': myconf}));
        } catch (err) {
            alert ("Unable to parse configuration. Please try again.");
        }
    }
    MRP.loadConfig();
    MRP.displayReviewScreen();
});

Config.payerEndpoints.forEach((e, id) => {
    $('#config-select').append("<option value='" + id + "'>" + e.name + "</option>");
});
$('#config-select').append("<option value='custom'>Custom</option>");
$('#config-text').val(JSON.stringify(Config.payerEndpoints[0],null,"   "));

$('#config-select').on('change', function () {
    if (this.value !== "custom") {
        $('#config-text').val(JSON.stringify(Config.payerEndpoints[parseInt(this.value)],null,2));
    }
});

$('#config-text').bind('input propertychange', () => {
    $('#config-select').val('custom');
});
console.log(sessionStorage,'session111')
FHIR.oauth2.ready(MRP.initialize);
// MRP.initialize();