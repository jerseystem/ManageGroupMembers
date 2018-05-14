/******************************************************************************
 * Add-on to make a spreadsheet control a google group.
 * @author Jeremy Lautman (jeremy.lautman@jerseystem.org)
 *****************************************************************************/

/**
 * Entrypoint
 */
function onOpen(e) {
  setMenu(e);
}

function onInstall(e) {
  onOpen(e);
}

function setMenu(e) {
  var ui = SpreadsheetApp.getUi();
  var menus = [];
  ui = ui.createAddonMenu();

  // Can schedule a time to run.
  ui = ui.addItem("Schedule Run Time", "scheduleRunTime")
         .addItem("Run Now", "runGroupManagementWithDisplay");

  if (!e || e.authMode != ScriptApp.AuthMode.NONE) {
    var groupMgmtTime = PropertiesService.getDocumentProperties().getProperty("GroupMgmtTime");
    if(groupMgmtTime) {
      // Has a group management time. Can cancel it.
      ui = ui.addItem("Cancel Scheduled Run", "cancelRunTime");
    }
  }

  ui.addToUi();
}

/**
 * Takes in a time to run from a prompt and stores it in the document properties.
 * Schedules the group management to run every day at the time indicated.
 * Only allows users to input a time between 0 and 23.
 */
function scheduleRunTime(e) {
  var props = PropertiesService.getDocumentProperties();
  var timeStr = props.getProperty("GroupMgmtTime");
  var ui = SpreadsheetApp.getUi();
  var resp = ui.prompt(
    "Select run time",
    "Please enter an hour to run every day between 0 (Midnight) - 23 (11 PM)." +
        (timeStr ? " Previously " + timeStr + "." : ""),
    ui.ButtonSet.OK_CANCEL);
  if(resp.getSelectedButton() != ui.Button.OK) {
    // Cancelled
    return;
  }
  // If they hit OK with an empty dialog, keep old time.
  var timeStr = resp.getResponseText() ? resp.getResponseText() : timeStr;
  var time = parseInt(timeStr, 10);
  if(isNaN(time) || time < 0 || time > 23) {
    Logger.log("User inputted a bad run time: %s", timeStr);
    return;
  }

  cancelRunTime();
  props.setProperty("GroupMgmtTime", timeStr);
  ScriptApp.newTrigger("runGroupManagementNoDisplay")
      .timeBased().everyDays(1)
      .atHour(time)
      .create();
  setMenu(e);
}

function cancelRunTime(e) {
  PropertiesService.getDocumentProperties().deleteProperty("GroupMgmtTime");
  SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if(trigger.getHandlerFunction() == "runGroupManagementNoDisplay") {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  setMenu(e);
}

function runGroupManagementNoDisplay() {
  runGroupManagement(false);
}

function runGroupManagementWithDisplay() {
  runGroupManagement(true);
}

function runGroupManagement(displayResults) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var membersSheet = ss.getSheetByName("Members");
  var events = [];
  var msg;
  membersSheet.activate();
  // Build a map of groups -> [emails] from the spreadsheet
  // Assumes that there are no duplicate rows
  var groupMemberships = {};
  var values = membersSheet.getDataRange().getValues();
  var email, group;
  for(var row=1; row < values.length; row++) {
    email = values[row][0];
    group = values[row][1];
    // Simple error checking. Can check if the group or email is valid?
    if(!email || !group) {
      msg = "Row " + row + "is invalid";
      Logger.log(msg);
      events.push(msg);
      return;
    }
    if(group in groupMemberships) {
      groupMemberships[group].push(email);
    } else {
      groupMemberships[group] = [email];
    }
  }
  
  // For each group, add all members not already in the group and remove all members not
  // in the spreadsheet.
  for (group in groupMemberships) {
    Logger.log("Getting all existing members of %s", group);
    var existingMembersList = [];
    try{
      forEachMemberOfGroup(group, function(member) {
        existingMembersList.push(member.email);
      });
    } catch (e) {
      // Group didn't already exist. Create it.
      try {
        createGroup(group);
        msg = "Created group " + group;
        Logger.log(msg);
        events.push(msg);
      } catch(e1) {
        msg = "Failed to create group " + group;
        Logger.log(msg);
        events.push(msg);
        continue;
      }
      // TODO change group properties? Make it TEAM instead of PUBLIC?
      // How to configure this?
    }
    var requestedMembersList = groupMemberships[group];
    
    // Add all members not already in the group
    var existingMembersSet = new Set(existingMembersList);
    requestedMembersList.filter(function(email) {
      return !existingMembersSet.has(email);
    }).forEach(function(email) {
      try {
        addGroupMember(email, group);
        msg = "Added " + email + " to " + group;
        Logger.log(msg);
        events.push(msg);
      } catch (err) {
        msg = "Failure: User "+ email + " is already a member of group " + group;
        Logger.log(msg);
        events.push(msg);
      }
    });
    
    // Remove all members in the group not in the spreadsheet
    var requestedMembersSet = new Set(requestedMembersList);
    existingMembersList.filter(function(email) {
      return !requestedMembersSet.has(email);
    }).forEach(function(email) {
      try {
        removeGroupMember(email, group);
        msg = "Removed " + email + " from " + group;
        Logger.log(msg);
        events.push(msg);
      } catch (err) {
        msg = "Failure: User " + email + " already not a member of group " + group;
        Logger.log(msg);
        events.push(msg);
      }
    });
  }
  if (displayResults) {
    displayEventList("Run Results", events);
  }
}

/**
 * Displays a list of events with a UI alert.
 */
function displayEventList(title, eventList) {
  var ui = SpreadsheetApp.getUi();
  var events = eventList.join('\n');
  var result = ui.alert(title, events ? events : '(None)', ui.ButtonSet.OK);
}

/**
 * Calls a function on each member of a group, returning nothing.
 * @param groupKey The group to query
 * @param fn       The function to call on each member object as yielded
 *                 from the AdminDirectory.
 * @throws An error if the group doesn't exist
 */
function forEachMemberOfGroup(groupKey, fn) {
  var pageToken, page;
  do {
    page = AdminDirectory.Members.list(groupKey, {pageToken: pageToken});
    (page.members ? page.members : []).forEach(fn);
    pageToken = page.nextPageToken;
  } while (pageToken);
}

/**
 * Creates a new group.
 * @param group The email address of the group.
 * @return The json object returned from the API.
 */
function createGroup(group) {
  return AdminDirectory.Groups.insert({
    email: group
  });
}

/**
 * Adds an email address to a group as a member.
 * @param userEmail The email to add.
 * @param groupEmail The email group.
 * @return The json object returned from the API.
 * @throws Error If the email is already in the group.
 */
function addGroupMember(userEmail, groupEmail) {
  return AdminDirectory.Members.insert({
    email: userEmail,
    role: 'MEMBER'
  }, groupEmail);
}

/**
 * Removes an email address from a group.
 * @param userEmail The email to remove.
 * @param groupEmail The email group.
 * @return The json object returned from the API.
 * @throws Error If the email isn't in the group.
 */
function removeGroupMember(userEmail, groupEmail) {
  return AdminDirectory.Members.remove(groupEmail, userEmail);
}

/**************Data structures ***************/

/**
 * A Set
 * @param fromIterable An iterable from which all items should be
 *                     added to this Set.
 */
function Set() {
  // Super simple implementation using Javascript's dict.
  // WARNING: This implementation tracks objects by JSON.stringify.
  // This can lead to unexpected behavior related to object property
  // order. It also has no support for iteration because Google's JS
  // is super old.
  this._contents = {};
  this._size = 0;
  if (arguments[0]) {
    for(var item in arguments[0]) {
      this.add(arguments[0][item]);
    }
  }
}

Set.prototype = {
  add: function(item) {
    if(!this.has(item)){
      this._contents[JSON.stringify(item)] = item;
      this._size++;
    }
  },
  remove: function(item) {
    if(this.has(item)) {
      delete this._contents[JSON.stringify(item)];
      this._size--;
    }
  },
  has: function(item) {
    return !!this._contents[JSON.stringify(item)];
  },
  size: function() {
    return this._size;
  }
}

function test_set() {
  var test = new Set();
  if(test.size() != 0){
    Logger.log("Size didn't start at 0");
    return;
  }

  test.add("test");
  if(test.size() != 1) {
    Logger.log("Add didn't correctly increase size: %d", test.size());
    return;
  }

  test.add("test");
  if(test.size() != 1) {
    Logger.log("Duplicate add changed size: %d", test.size());
    return;
  }

  if(!test.has("test")) {
    Logger.log("Contains can't find string");
    return;
  }
  
  test.add("test2");
  if(!test.has("test")) {
    Logger.log("Adding lost previous item");
    return;
  }
  if(test.size() != 2) {
    Logger.log("Second add didn't correctly increase size: %s", test.size());
    return;
  }

  test.remove("test");
  if(test.size() != 1) {
    Logger.log("Remove didn't decrement size: %s", test.size());
    return;
  }
  if(test.has("test")) {
    Logger.log("Remove didn't remove");
    return;
  }
  if(!test.has("test2")) {
    Logger.log("Remove killed an unexpected item.");
    return;
  }

  test = new Set();
  test.add({});
  if(test.size() != 1) {
    Logger.log("Add didn't correctly increase size: %d", test.size());
    return;
  }
  if(!test.has({})) {
    Logger.log("Contains can't find an identical empty object");
    return;
  }
  test = new Set();
  var oneProp = {prop1: "thing"}
  test.add(oneProp);
  if(!test.has(oneProp) || test.size() != 1) {
    Logger.log("Object with one property failed: %s %s", test.has(oneProp), test.size());
    return;
  }
}