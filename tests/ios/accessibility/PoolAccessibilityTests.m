#import <XCTest/XCTest.h>

@interface PoolAccessibilityTests : XCTestCase
@end

@implementation PoolAccessibilityTests
- (void)setUp { self.continueAfterFailure = NO; }
- (void)testVoiceOverSignupNavigation {
  XCUIApplication *app = [[XCUIApplication alloc] initWithBundleIdentifier:@"dev.pool.prototype"];
  [app launch];
  XCUIElement *brand = [[app descendantsMatchingType:XCUIElementTypeAny] matchingIdentifier:@"brand"].firstMatch;
  XCTAssertTrue([brand waitForExistenceWithTimeout:60]);
  [[XCUIDevice sharedDevice].system openURL:[NSURL URLWithString:@"pool:///sign-up"]];
  XCUIApplication *springboard = [[XCUIApplication alloc] initWithBundleIdentifier:@"com.apple.springboard"];
  if ([springboard.buttons[@"Open"] waitForExistenceWithTimeout:3]) [springboard.buttons[@"Open"] tap];
  XCUIElement *heading = [[app descendantsMatchingType:XCUIElementTypeAny] matchingPredicate:[NSPredicate predicateWithFormat:@"label == %@", @"Create your Pool account"]].firstMatch;
  XCTAssertTrue([heading waitForExistenceWithTimeout:60]);
  if (@available(iOS 27.0, *)) {
    XCUIVoiceOverService *voiceOver = [XCUIDevice sharedDevice].voiceOverService;
    NSError *error = nil;
    [self addTeardownBlock:^{ NSError *stopError = nil; [voiceOver disableAndReturnError:&stopError]; }];
    XCTAssertTrue([voiceOver enableAndReturnError:&error], @"%@", error);
    NSMutableArray<NSString *> *speech = [NSMutableArray array];
    NSArray<NSString *> *required = @[@"Create your Pool account", @"Email address", @"Password", @"I am at least 18 years old", @"Create account", @"Sign in"];
    NSMutableSet<NSString *> *heard = [NSMutableSet set];
    void (^recordSpeech)(XCUIVoiceOverOutput *) = ^(XCUIVoiceOverOutput *output) {
      if (!output) return;
      [speech addObject:output.utterance];
      for (NSString *label in required) if ([output.utterance localizedCaseInsensitiveContainsString:label]) [heard addObject:label];
    };
    recordSpeech([voiceOver currentSpeechAndReturnError:&error]);
    for (NSUInteger index = 0; index < 60 && heard.count < required.count; index++) {
      error = nil;
      XCUIVoiceOverOutput *output = [voiceOver moveForwardAndReturnError:&error];
      XCTAssertNotNil(output, @"%@", error);
      if (!output) break;
      recordSpeech(output);
    }
    XCTAttachment *attachment = [XCTAttachment attachmentWithString:[speech componentsJoinedByString:@"\n"]];
    attachment.name = @"Actual VoiceOver speech through signup";
    attachment.lifetime = XCTAttachmentLifetimeKeepAlways;
    [self addAttachment:attachment];
    for (NSString *label in required) XCTAssertTrue([heard containsObject:label], @"VoiceOver did not reach %@. Speech: %@", label, speech);
  } else {
    XCTSkip(@"VoiceOver automation requires iOS 27 and Xcode 27.");
  }
}
@end
