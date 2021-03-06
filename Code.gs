/******************************************************************************
 * Script to make this spreadsheet authoritative for all groups.
 * @author Jeremy Lautman (jeremy.lautman@jerseystem.org)
 *****************************************************************************/

/**
 * Entrypoint
 */
function main() {
  var Set = cEs6Shim.Set;
  //var Map = cEs6Shim.Map;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var membersSheet = ss.getSheetByName("Members");
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
      Logger.log("Row %d is invalid", row);
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
      Logger.log("Creating group %s", group);
      try {
        createGroup(group);
      } catch(e1) {
        Logger.log("Failed to create group %s", group);
      }
      // TODO change group properties? Make it TEAM instead of PUBLIC?
    }
    var requestedMembersList = groupMemberships[group];
    
    // Add all members not already in the group
    var existingMembersSet = new Set(existingMembersList);
    requestedMembersList.filter(function(email) {
      return !existingMembersSet.has(email);
    }).forEach(function(email) {
      try {
        addGroupMember(email, group);
        Logger.log("Added %s to %s", email, group);
      } catch (err) {
        Logger.log('Failure: User %s already a member of group %s', email, group);
      }
    });
    
    // Remove all members in the group not in the spreadsheet
    var requestedMembersSet = new Set(requestedMembersList);
    existingMembersList.filter(function(email) {
      return !requestedMembersSet.has(email);
    }).forEach(function(email) {
      try {
        removeGroupMember(email, group);
        Logger.log("Removed %s from %s", email, group);
      } catch (err) {
        Logger.log('Failure: User %s already not a member of group %s', userEmail, groupEmail);
      }
    });
  };
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
