
#include <iostream>
#include <vector>
#include <string>
enum class Country { /*...*/ };
enum class Currency { /*...*/ };
enum class PersonTitle {/*...*/ };
enum class LanguageRegionCode { /*...*/ };
enum class IssueStatus { /*...*/ };
enum class Authority { /*...*/ };
enum class SubscriptionType { /*...*/ };
enum class JobStatus { /*...*/ };
enum class ClientStatus { /*...*/ };
enum class Position { /*...*/ }; // each organization has its own position list
struct Company {
    std::string p_Name;
    Country p_Country;
    Currency p_Currency;
    std::string p_PhotoPath;
    std::vector<std::string> p_Links;
};
struct Personage {
    std::string p_FirstName;
    std::string p_LastName;
    PersonTitle p_Title;
    LanguageRegionCode p_LanguageRegionCode;

	std::string p_PhoneNumber;
	std::string p_EmailAddress;
    Position p_Position;
	Company p_Company;
    JobStatus p_JobStatus;

    std::string p_PhotoPath;
    std::vector<std::string> p_Links;
};
struct Profit {
	ClientGroup p_Client;
	float p_Amount;
	Currency p_Currency;
	std::time_t p_IssueDate;
	std::string p_Description; // JSON
};
struct Churn {
	ClientGroup p_Client;
	std::time_t p_IssueDate;
	std::string p_Description; // JSON
};
struct Issue {
	ClientGroup p_Client;
    Member p_Member;
    Viewer p_Viewer;
	IssueStatus p_Status;
	std::time_t p_StartDate;
    std::time_t p_EndDate;
	std::string p_Description; // JSON
    std::vector<Issue> p_SubIssues;
};
struct Viewer : Personage {
    // here I can add some specific fields for Viewer if needed
};
struct Member : Personage {
    std::vector<Authority> p_Authorities;
    std::vector<ClientGroup> p_Clients;
};
struct Manager : Member {
    std::vector<Member> p_Team;
};
struct ClientGroup : Company {
    std::vector<Viewer> p_Viewers;
    ClientStatus p_Status;
};
struct Subscription {
    Company p_Organization;
    std::time_t p_IssueDate;
    SubscriptionType p_Type;
};
struct Organization : Company {
    std::vector<ClientGroup> p_Clients;
    std::vector<Personage> p_Workers; // Manager, Member, Viewer, Other
    std::vector<Issue> p_Issues;
    std::vector<Profit> p_Profits;
    std::vector<Churn> p_Churns;
};