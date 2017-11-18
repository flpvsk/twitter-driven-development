# Twitter-Driven Development

A sad look into the future of software project management.

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->


- [Abstract](#abstract)
- [Rules](#rules)
  - [Joining / leaving the game](#joining--leaving-the-game)
  - [Customer](#customer)
  - [Product Owner](#product-owner)
  - [Engineering](#engineering)
  - [QA](#qa)
- [Examples](#examples)
  - [Example 1](#example-1)
  - [Example 2](#example-2)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Abstract

This is a game I've invented for my talk about "Theory of Constraints in
startups". The idea is to demonstrate different techniques (kanban,
drum-buffer-rope) and pitfalls (local optimization, unplanned work) in
managing work.


## Rules

The game imitates multi-stage work in a company. Tasks go from one
division to another. Each division has to perform certain kind of work
(tweet a certain thing) to move the task forward.

The goal of the game is to minimize lead time and lead time deviation of
each task and maximize number of processed tasks during a fixed time frame.

There are 4 different roles in the game. In the beginning participants are
divided into:

1. Customers
2. Product Owners
3. Engineers
4. QA

### Joining / leaving the game

In order for the server to know that it needs to watch your tweets and to
assign a role to you as a player, you will need to join the game.
You can do it with a tweet:

> @mngr999 join

You will then start receiving notifications from the bot (`@mngr999`).
*Important:* please follow that account so notifications don't end
up filtered by Twitter as spam.

If you'd like to join with a specific role, for example QA:

> @mngr999 join qa

If you'd like to leave the game:

> @mngr999 leave

You can join again at any time.


### Customer

Customer starts the game by tweeting anything with the game's hashtag (to
be defined by the moderator).

E.g. if `#expectations` is the hashtag, then a customer could tweet:

> I want that shiny pink spaceship by tomorrow! #expectations


### Product Owner

Product owner's role is to find customer tweets and reply with a "spec"
for engineers.

To prevent several POs working on the same task, they should "favorite"
customer's tweet to indicate that they're "on it".

Spec is a gif. So the task of the product owner is to simply reply to the
customer's tweet with a gif that resembles the feature they've described.

For example, PO could answer to the customer's tweet I've mentioned before
with this gif:

![Spaceship image](https://78.media.tumblr.com/b3e70f28576387fda876d31f016d7210/tumblr_ockq1vBVUo1ujqvcvo1_500.gif)

*Image credit:*
[http://glitchblackmusic.tumblr.com/post/149556177846/warpzone](http://glitchblackmusic.tumblr.com/post/149556177846/warpzone)

### Engineering

Engineer's taks is to implement whatever Product Owner tweeted "close
enough but not quite" and reply to PO's tweet with the implementation.

To prevent several Egineers working on the same spec, they should
"favorite" PO's tweet to indicate that they're "on it".

Engineering should implement the solution in "emoji" language. For
example:

> 👾🚀🎀

### QA

QA's task is to check if engineer's implementation is matching the spec
and reply to engineer's tweet with "approved" or "rejected".

To prevent several QAs working on the same implementation, they should
"favorite" Engineer's tweet to indicate that they're "on it".

If the work was rejected, engineer can redo the implementation in a reply
to QA's tweet.

## Examples

### Example 1

Finished task:

@customer:
> Shiny pink spaceship by tomorrow! #expectations

@product_owner replying to @customer:
> ![Spaceship image](https://78.media.tumblr.com/b3e70f28576387fda876d31f016d7210/tumblr_ockq1vBVUo1ujqvcvo1_500.gif)

@engineer replying to @product_owner:
> 👾🚀🎀

@qa replying to @engineer:
> approved

@game\_bot replying to @customer, @product\_owner, @engineer, @qa:
> Congrats on your finished task! Your lead time is 35s


### Example 2

Rejected work:


@customer:
> Blinking text on my checkout page! #expectations

@product\_owner replying to @customer:
> ![Blinking text](http://78.media.tumblr.com/162ef9e138b720bd1746af645595a6b2/tumblr_ogg138gLg11twnexlo1_500.gif)

*Image credit:*
[http://just-usmadd.tumblr.com/post/153007022361](http://just-usmadd.tumblr.com/post/153007022361)

@engineer replying to @product\_owner:
> 👎👎👎👎

@qa replying to @engineer:
> rejected

@engineer replying to @qa:
> 😉text😉

@qa replying to @engineer:
> approved!

@game\_bot replying to @customer, @product\_owner, @engineer, @qa:
> Congrats on your finished task! Your lead time is 69s
