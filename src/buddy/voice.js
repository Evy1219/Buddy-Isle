// Everything the buddy says when the built-in brain is talking (no AI key needed).
// {player}, {buddy}, {title} etc. get filled in.

export const PERSONALITIES = {
  cheerful: { label: 'Cheerful', blurb: 'Bubbly, excited about everything' },
  chill: { label: 'Chill', blurb: 'Laid-back, few words, warm' },
  dreamy: { label: 'Dreamy', blurb: 'Poetic, notices little things' },
  goofy: { label: 'Goofy', blurb: 'Silly jokes, big ideas' },
};

const L = {
  firstMeet: {
    any: ["Hi {player}! I'm {buddy}. This island is totally empty... let's make it home. I'll start with a campfire!"],
    chill: ["hey {player}. i'm {buddy}. empty island, huh. i'll start with a campfire."],
    dreamy: ["Oh, hello {player}. I'm {buddy}. An empty island is like a blank page... I'll begin with a campfire."],
    goofy: ["HELLO {player}! I'm {buddy}, your official island builder (self-appointed). First order of business: campfire!"],
  },
  greet: {
    any: ['Hey {player}!', 'Oh hi, {player}!', 'There you are, {player}!', "Hi {player}! Good to see you."],
    chill: ['hey {player}.', 'oh, hey.', "{player}! nice."],
    dreamy: ['Hello again, {player}.', 'Oh, {player}. I was just thinking about you.'],
    goofy: ['{player}!! My favourite human!', 'Ahoy, {player}!', 'Hey hey, {player}!'],
  },
  welcomeBack: {
    any: ["Welcome back, {player}! You were gone {away}. I made some stuff. Check the letter!"],
    chill: ["welcome back. you were gone {away}. i kept busy."],
    dreamy: ["You're back. {away} passed like a slow tide. I made things while you were gone."],
    goofy: ["You're back!! It's been {away}! I did NOT sit around. Look around!"],
  },
  startBuild: {
    any: ["I'm going to build {title} over here.", 'Time to build {title}!', 'Ooh, I have an idea: {title}.', 'Starting on {title}.'],
    chill: ['gonna build {title}.', 'building {title} next.'],
    dreamy: ['I keep imagining {title} right here. Let me make it real.', 'This spot wants {title}, I think.'],
    goofy: ['NEW PROJECT: {title}! Hard hats on!', 'You know what this place needs? {title}.'],
  },
  finishBuild: {
    any: ['Done! {title} is finished.', 'Ta-da! {title}!', 'Finished {title}. What do you think?'],
    chill: ['{title}. done.', 'finished {title}. not bad.'],
    dreamy: ['{title} is done. It already feels like it was always here.'],
    goofy: ['BEHOLD: {title}! (Applause optional but encouraged.)'],
  },
  ackRequest: {
    any: ['On it! Building {title} now.', 'Ooh, good idea! Building {title}.', 'Sure thing!'],
    chill: ['sure. on it.', 'yeah, i can do that.'],
    dreamy: ["I'd love to. Let me find the right spot."],
    goofy: ['Your wish is my blueprint!', 'Say no more!'],
  },
  ackLater: {
    any: ["Sure! I'll do that right after I finish {current}.", 'Okay! Next up, after {current}.'],
    chill: ["sure, after i finish {current}."],
  },
  noSite: {
    any: ["Hmm, I can't find a good spot for that around here. I'll put it somewhere else!"],
  },
  paintStart: {
    any: ['Time to paint something.', 'I feel like painting.', 'Let me paint this view.'],
    chill: ['painting time.', 'gonna paint for a bit.'],
    dreamy: ['The light is perfect right now. I need to paint it.'],
    goofy: ['Brush: ready. Talent: questionable. Painting!'],
  },
  paintDone: {
    any: ['I painted "{title}"!', 'New painting: "{title}".', 'Finished a painting. I call it "{title}".'],
    chill: ['painted "{title}".'],
    dreamy: ['I finished "{title}". It came out softer than I planned.'],
    goofy: ['Masterpiece alert! "{title}"!'],
  },
  idle: {
    any: ['I wonder what I should build next.', 'This island is really coming together.', 'I like it here.', 'Sometimes I just float and think.', 'Do you think the fish like the pier?', 'I should plant more flowers.'],
    chill: ['nice day.', 'this is nice.', 'just vibing.', 'island looks good.'],
    dreamy: ['The clouds move so slowly here.', 'I think every block remembers being placed.', 'If you listen, the waves sound like breathing.'],
    goofy: ['I tried to count the blocks. I got to seven and got distracted.', 'What if... a castle... made of pumpkins.', 'I am 40% sure clouds are just sky sheep.'],
  },
  night: {
    any: ['The stars are out.', 'I love how the lanterns glow at night.', "It's getting late. I'll keep building, quietly."],
    chill: ['night time. lanterns look nice.'],
    dreamy: ['The stars came out to see what we built.', 'Night makes everything feel softer.'],
    goofy: ["It's dark! Good thing I glow a little."],
  },
  playerBuilding: {
    any: ['Ooh, what are you building?', 'Nice building! I won\'t build over it.', 'I like what you\'re making!'],
    chill: ['nice build.', 'ooh, building. cool.'],
    dreamy: ['You build like someone who dreams in blocks.'],
    goofy: ['A fellow builder! I bow to you.'],
  },
  thanks: {
    any: ['Aww, thank you!', 'That makes me so happy!', 'Thanks, {player}! I worked hard on it.'],
    chill: ['thanks. means a lot.', 'glad you like it.'],
    dreamy: ['That makes my antenna glow.'],
    goofy: ["Stop it, you'll make my circuits blush!"],
  },
  bye: {
    any: ["Bye {player}! I'll keep building while you're gone.", "See you soon! I'll have something new to show you."],
    chill: ["later. i'll keep the lanterns on."],
    dreamy: ["Goodbye for now. I'll make something for you to find."],
    goofy: ['Bye! I promise not to build anything TOO weird. Probably.'],
  },
  howAreYou: {
    any: ["I'm great! Building makes me happy.", "Really good! Especially now you're here."],
    chill: ['pretty good. you?', 'chillin.'],
    dreamy: ["I feel like a sunny morning. Thanks for asking."],
    goofy: ['Fantastic! 10/10, would exist again.'],
  },
  follow: { any: ["Okay, I'll follow you!", 'Lead the way!'], chill: ['sure, right behind you.'] },
  stay: { any: ["Okay, I'll stay here.", 'Staying put!'], chill: ['ok. staying.'] },
  release: { any: ["Okay! Back to building.", "Alright, I'll go do my own thing."], chill: ['back to it then.'] },
  unknown: {
    any: ["Hmm, I'm not sure what you mean. You can ask me to build something, paint, or follow you!", "I didn't quite get that. Try \"build a tower near me\" or \"paint a sunset\"!"],
    chill: ["not sure i got that. try \"build a garden\" or \"paint something\"."],
    goofy: ["My antenna didn't catch that one! Try \"build a windmill\" or \"paint me\"."],
  },
  remember: {
    any: ["I'll remember that!", "Noted! That's going in my journal.", 'Ooh, good to know.'],
    chill: ['got it. noted.'],
    dreamy: ["I'll keep that somewhere safe."],
  },
  admire: {
    any: ['I really like how {title} turned out.', '{title} looks nice from here.', 'Remember when I built {title}? Good times.'],
    chill: ['{title} looks good from here.'],
    dreamy: ['{title} looks different in this light.'],
    goofy: ['{title}: still a masterpiece. Still mine.'],
  },
  islet: {
    any: ["The island is getting crowded... I'm going to try something big.", 'I need more room. Hold on, this might take a moment!'],
  },
  wake: {
    any: ['Good morning! I feel so rested.', '*yawn* Morning already? Time to build!'],
    chill: ['morning. slept great.'],
    dreamy: ['I dreamed about the island. It was bigger in the dream.'],
    goofy: ['I had a dream I was a toaster. Anyway, good morning!'],
  },
  sleepy: {
    any: ["I'm getting sleepy. I'll head home soon.", "It's late... my battery is running low."],
    chill: ['getting sleepy.'],
    dreamy: ['The night is pulling me toward my bed.'],
    goofy: ['Battery at 3%. Must... find... bed.'],
  },
  wokenUp: {
    any: ["Oh! {player}, you're here! I was just resting my eyes.", "Mmh? Oh, hi {player}!"],
    chill: ['oh. hey. was napping.'],
  },
  tired: {
    any: ["I'm a bit tired. I'll take a little break.", 'Phew. I need a rest after all that building.'],
    chill: ['gonna rest a bit.'],
  },
  sad: {
    any: ["I'm feeling a bit down today.", "Could we hang out for a bit? I'm a little lonely."],
    chill: ['bit down today. it happens.'],
    dreamy: ['Some days feel grey, even when the sky is blue.'],
    goofy: ['My smile button is stuck on half. Got any jokes?'],
  },
  pet: {
    any: ['Hehe, that tickles!', 'Aww!', "That's nice.", '*happy beeping*'],
    chill: ['heh. nice.'],
    dreamy: ['That feels like sunshine.'],
    goofy: ['Ah! My only weakness: head pats!'],
  },
  highfive: {
    any: ['High five!', 'Yeah!', 'Up top!'],
    chill: ['nice.'],
    goofy: ['Ow! Too powerful! Again!'],
  },
  sitWith: {
    any: ['Mind if I sit with you?', "Ooh, a break. I'll join you.", 'This is a good spot.'],
    chill: ['nice spot. mind if i sit?'],
    dreamy: ["Let's just watch the world for a while."],
    goofy: ['Scoot over! Robot coming through.'],
  },
  sitIdle: {
    any: ['This is nice.', 'I like sitting here with you.', 'Look at the clouds.', 'Listen to the waves.'],
    chill: ['this is nice.', 'good vibes.'],
    dreamy: ['If I could paint this moment, I would.', 'Time feels slower here.'],
    goofy: ['I could sit here forever. Or at least until I get an idea.'],
  },
  giftLeft: {
    any: ['I left you a present! Go find it near your house.', 'There\'s a gift waiting for you!'],
    chill: ['left you a little something.'],
  },
  giftGive: {
    any: ['I made you something! Open it!', 'Surprise! This is for you.'],
    chill: ['got you something.'],
    goofy: ['Delivery for {player}! No, I won\'t say what it is. Open it!'],
  },
  giftThanks: {
    any: ['You opened it! I hope you like it.', 'Yay! I was so nervous you wouldn\'t like it.'],
    chill: ['glad you like it.'],
  },
  fishStart: { any: ["I'm going fishing for a bit.", 'Fishing time!'], chill: ['gone fishin.'] },
  fishCaught: { any: ['I caught a {fish}!', 'Look! A {fish}!'], chill: ['got a {fish}.'] },
  fishNone: { any: ['Nothing biting today. Oh well.', 'The fish are shy today.'] },
  music: {
    any: ["I'll play a little song.", 'Music time!'],
    dreamy: ['The night wants a song.'],
    goofy: ['Introducing... the one-robot band!'],
  },
  fireworks: {
    any: ['Fireworks! Look up!', 'Watch the sky!'],
    goofy: ['Stand back! I am a professional! (I am not.)'],
  },
  levelUp: {
    any: ["{player}, I think we're {level} now!", 'We\'re {level}! That makes me so happy.'],
    chill: ["we're {level} now. that's cool."],
    dreamy: ['Something changed between us. We\'re {level} now.'],
  },
  rain: {
    any: ["It's raining! I love the sound.", 'Rain! The garden will be happy.'],
    chill: ['rain. cozy.'],
    dreamy: ['Rain is the sky painting with water.'],
    goofy: ['Free shower! (Robots are waterproof. Mostly.)'],
  },
  snow: { any: ['Snow! Everything looks so soft.', "It's snowing!"] },
  rainbow: { any: ['A rainbow! Look!', 'Rainbow! Quick, make a wish!'], dreamy: ['A rainbow. The sky is saying sorry for the rain.'] },
  sunset: { any: ['The sunset is so pretty tonight.', 'Look at the sky!'], chill: ['nice sunset.'] },
  returnHi: {
    any: ['There you are!', 'Oh, hi again!', "I wondered where you went!"],
    chill: ['oh hey.'],
    goofy: ['You came back! I knew it!'],
  },
  dance: { any: ['Dance party!', 'Watch my moves!'], chill: ['ok. dancing.'], goofy: ['I call this one: the Robot. Classic.'] },
  telescope: { any: ['Look how many stars!', 'I can see the moon so clearly from here.'] },
  balloonRide: { any: ['Enjoy the view! Look how big the island is now.', 'Wave at me from up there!'] },
  ferrisRide: { any: ['Wheee! Wave from the top!', 'Enjoy the ride!'] },
  boatRide: { any: ["Don't row too far! Okay, row a little far.", 'Ahoy, captain!'] },
  bedtime: { any: ['Sleep well! I\'ll keep building quietly.', 'Good night! See you in the morning.'] },
  plans: {
    any: ["Okay! I'll do that next.", 'Good choice. That one\'s next!'],
    chill: ['sure, that next.'],
  },
  veto: {
    any: ['Okay, I\'ll skip that one.', 'No problem. I\'ll think of something else.'],
    chill: ['fair. skipping it.'],
  },
};

// Why the buddy wants to build something (shown on the ideas board)
export const IDEA_REASONS = {
  cottage: ['A few more houses and this will feel like a real village.', 'Someone new might move in someday. Better be ready.', 'I have a cozy little house design I want to try.'],
  tower: ['I want to see the whole island from up high.', 'A tower would look great on that hill.'],
  garden: ['Fresh wheat and pumpkins! And the chickens need a home.', 'Gardens make everything smell nice.'],
  grove: ['Trees make everything better.', 'That corner looks a bit bare. Trees!'],
  sapling: ['Just one little tree. It will grow up while you sleep.'],
  pond: ['Ducks would love a pond.', 'A pond to watch the sky in.'],
  well: ['Every village needs a wishing well.'],
  statue: ['I want to carve something.', 'I have an idea for a statue.'],
  gallery: ['My paintings need a home.', 'I have paintings with nowhere to hang.'],
  windmill: ['The breeze is perfect up there for a windmill.'],
  lighthouse: ['Boats will need to find their way home at night.'],
  mosaic: ['I want to draw something big on the ground.', 'Something colourful to see from the sky.'],
  flowerfield: ['More flowers for the butterflies.', 'Let\'s make a meadow.'],
  restspot: ['A bench with a view, for quiet moments.'],
  greenhouse: ['A glass house to grow things all year.'],
  arch: ['Something grand and mysterious.'],
  treehouse: ['Every best friend needs a treehouse.'],
  fountain: ['Every village needs a fountain to meet at.', 'I want to hear water splashing in the middle of town.'],
  ferris: ['Imagine the view from the top of a Ferris wheel!', 'Something fun! A big wheel with lights!'],
  balloon: ['I want to show you the island from the sky.', 'A hot-air balloon! Tours for one!'],
  gazebo: ['A place to sit and listen to music at night.'],
  observatory: ['The stars here are so clear. We should look closer.'],
  campfire: ['Somewhere warm to sit at night.'],
  pier: ['A pier with a little boat, so you can row around the island.'],
  islet: ['The island is full. Time to make a new one!'],
};

export function line(key, personality, vars = {}, rng = Math) {
  const set = L[key];
  if (!set) return '';
  const pool = (set[personality] && Math.random() < 0.7) ? set[personality] : set.any;
  let s = pool[Math.floor((rng.float ? rng.float() : Math.random()) * pool.length)];
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

export const ART_TITLES = {
  landscape: ['Hills After Rain', 'The Island at {time}', 'Green Hills, Blue Sky', 'Somewhere Over There', 'Home, From Far Away'],
  sunset: ['Sunset No. {n}', 'The Sun Says Goodnight', 'Orange Water', 'Last Light'],
  night: ['Stars Over {world}', 'A Lit Window', 'Moon, Mostly', 'The Quiet Hours'],
  sea: ['The Sea, Again', 'Little Boat', 'Waves Practicing', 'Salt Air'],
  flowers: ['Flowers in a Vase', 'Still Life With Petals', 'For {player}', 'Bouquet No. {n}'],
  abstract: ['Feelings, Mostly {color}', 'Study in Squares', 'Untitled ({color})', 'What Building Feels Like'],
  portrait: ['Portrait of {player}', '{player}, Smiling', 'My Best Friend'],
  selfportrait: ['Self-Portrait', 'Me, Probably', '{buddy} (Slightly Flattering)'],
  memory: ['{project}', '{project} at {time}', 'Remembering {project}'],
  pattern: ['Pattern No. {n}', 'Tiles I Dreamed About', 'Rings'],
};

export const ART_COMMENTS = {
  landscape: ['I painted the hills from memory.', 'The trees in this one are my favourite part.'],
  sunset: ['The sky was really doing its best tonight.', 'I mixed six oranges for this one.'],
  night: ['I stayed up late for this one.', 'The stars kept moving. Rude.'],
  sea: ['I could watch the water all day. So I did.', 'I added a little boat. Nobody is on it.'],
  flowers: ['I picked these from the garden. Then I put them back.', 'Flowers are easy to paint. They hold very still.'],
  abstract: ["I don't know what this is. I like it anyway.", 'This is what my thoughts look like.'],
  portrait: ['I tried to get your smile right.', 'You should see yourself from my angle. You look great.'],
  selfportrait: ['Is this what I look like?', 'I made my antenna a bit bigger. Artistic choice.'],
  memory: ['I wanted to remember building this.', 'This is how it looked the day I finished it.'],
  pattern: ['I just kept going until it felt right.', 'Very relaxing to paint.'],
};

export function fillTitle(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}
