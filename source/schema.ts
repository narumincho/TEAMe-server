import * as g from "graphql";
import Maybe from "graphql/tsutils/Maybe";
import { URL } from "url";
import * as data from "./data";
import * as database from "./database";

export const parseFileHash = (value: unknown): database.FileHash => {
  if (typeof value !== "string") {
    throw new Error("Hash must be string");
  }
  // a.png などのサンプルのユーザのため
  // if (value.length !== 64) {
  //   throw new Error("Hash length must be 64");
  // }
  // for (const char of value) {
  //   if (!"0123456789abcdef".includes(char)) {
  //     throw new Error("Hash char must match /[0-9a-f]/");
  //   }
  // }
  return value as database.FileHash;
};

const fileHashTypeConfig: g.GraphQLScalarTypeConfig<
  database.FileHash,
  string
> = {
  name: "FileHash",
  description:
    "SHA-256で得られたハッシュ値。hexスタイル。16進数でa-fは小文字、64文字 https://us-central1-teame-c1a32.cloudfunctions.net/file/{hash} のURLからファイルを得ることができる",
  serialize: (value: database.FileHash): string => value,
  parseValue: parseFileHash
};

const hashGraphQLType = new g.GraphQLScalarType(fileHashTypeConfig);

const makeObjectFieldMap = <Type extends { [k in string]: unknown }>(
  args: Type extends { id: string } | { hash: string }
    ? {
        [Key in keyof Type]: Key extends "id" | "hash"
          ? {
              type: g.GraphQLOutputType;
              description: string;
            }
          : GraphQLFieldConfigWithArgs<Type, Key>;
      }
    : {
        [Key in keyof Type]: {
          type: g.GraphQLOutputType;
          description: string;
        };
      }
): g.GraphQLFieldConfigMap<Type, void, any> => args;

type GraphQLFieldConfigWithArgs<
  Type extends { [k in string]: unknown },
  Key extends keyof Type // この型変数は型推論に使われる
> = {
  type: g.GraphQLOutputType;
  args: any;
  resolve: g.GraphQLFieldResolver<Type, void, any>;
  description: string;
  __byMakeObjectFieldFunctionBrand: never;
};

const makeObjectField = <
  Type extends { [k in string]: unknown },
  Key extends keyof Type,
  T extends { [k in string]: unknown } // for allがあればなぁ
>(data: {
  type: g.GraphQLOutputType;
  args: { [k in keyof T]: { type: g.GraphQLInputType } };
  resolve: (
    source: database.Return<Type>,
    args: T
  ) => Promise<database.Return<Type[Key]>>;
  description: string;
}): GraphQLFieldConfigWithArgs<Type, Key> =>
  ({
    type: data.type,
    args: data.args,
    resolve: (source, args, context, info) => data.resolve(source as any, args),
    description: data.description
  } as GraphQLFieldConfigWithArgs<Type, Key>);

const makeQueryOrMutationField = <
  Args extends { [k in string]: unknown },
  Type
>(data: {
  type: g.GraphQLOutputType;
  args: {
    [a in keyof Args]: {
      type: g.GraphQLInputType;
      description: Maybe<string>;
    };
  };
  resolve: (args: Args) => Promise<database.Return<Type>>;
  description: string;
}): g.GraphQLFieldConfig<void, void, any> => {
  return {
    type: data.type,
    args: data.args,
    resolve: (source, args, context, info): Promise<database.Return<Type>> =>
      data.resolve(args),
    description: data.description
  };
};

const urlTypeScalarTypeConfig: g.GraphQLScalarTypeConfig<URL, string> = {
  name: "URL",
  description: `URL 文字列で指定する 例"https://narumincho.com/definy/spec.html"`,
  serialize: (url: URL): string => url.toString(),
  parseValue: (value: string): URL => new URL(value)
};

const urlGraphQLType = new g.GraphQLScalarType(urlTypeScalarTypeConfig);

const dateTimeTypeConfig: g.GraphQLScalarTypeConfig<Date, number> = {
  name: "DateTime",
  description:
    "日付と時刻。1970年1月1日 00:00:00 UTCから指定した日時までの経過時間をミリ秒で表した数値 2038年問題を回避するために64bitFloatの型を使う",
  serialize: (value: Date): number => value.getTime(),
  parseValue: (value: number): Date => new Date(value),
  parseLiteral: ast => {
    if (ast.kind === "FloatValue" || ast.kind === "IntValue") {
      try {
        return new Date(Number.parseInt(ast.value));
      } catch {
        return null;
      }
    }
    return null;
  }
};

export const dateTimeGraphQLType = new g.GraphQLScalarType(dateTimeTypeConfig);

const roleGraphQLType = new g.GraphQLEnumType({
  name: "Role",
  values: database.roleValues,
  description: "役割"
});

const setCycle = async (
  source: database.Return<database.GraphQLCycleData>
): Promise<database.GraphQLCycleData> => {
  const data = await database.getCycleData(source.id);
  source.plan = data.plan;
  source.do = data.do;
  source.check = data.check;
  source.act = data.act;
  source.createdAt = data.createdAt;
  source.updateAt = data.updateAt;
  return data;
};

const cycleGraphQLType: g.GraphQLObjectType<
  database.GraphQLCycleData,
  void,
  {}
> = new g.GraphQLObjectType({
  name: "Cycle",
  description: "1つのPDCA。cycle",
  fields: makeObjectFieldMap<database.GraphQLCycleData>({
    id: {
      description: "Pdcaを識別するためのID",
      type: g.GraphQLNonNull(g.GraphQLString)
    },
    plan: makeObjectField({
      description: "Plan",
      args: {},
      type: g.GraphQLNonNull(g.GraphQLString),
      resolve: async source => {
        if (source.plan === undefined) {
          return (await setCycle(source)).plan;
        }
        return source.plan;
      }
    }),
    do: makeObjectField({
      description: "Do",
      args: {},
      type: g.GraphQLNonNull(g.GraphQLString),
      resolve: async source => {
        if (source.do === undefined) {
          return (await setCycle(source)).do;
        }
        return source.do;
      }
    }),
    check: makeObjectField({
      description: "Check",
      args: {},
      type: g.GraphQLNonNull(g.GraphQLString),
      resolve: async source => {
        if (source.check === undefined) {
          return (await setCycle(source)).check;
        }
        return source.check;
      }
    }),
    act: makeObjectField({
      description: "Act",
      args: {},
      type: g.GraphQLNonNull(g.GraphQLString),
      resolve: async source => {
        if (source.act === undefined) {
          return (await setCycle(source)).act;
        }
        return source.act;
      }
    }),
    createdAt: makeObjectField({
      description: "Plan",
      args: {},
      type: g.GraphQLNonNull(dateTimeGraphQLType),
      resolve: async source => {
        if (source.createdAt === undefined) {
          return (await setCycle(source)).createdAt;
        }
        return source.createdAt;
      }
    }),
    updateAt: makeObjectField({
      description: "Plan",
      args: {},
      type: g.GraphQLNonNull(dateTimeGraphQLType),
      resolve: async source => {
        if (source.updateAt === undefined) {
          return (await setCycle(source)).updateAt;
        }
        return source.updateAt;
      }
    })
  })
});

const setUserData = async (
  source: database.Return<database.GraphQLUserData>
): Promise<database.GraphQLUserDataLowCost> => {
  const data = await database.getUserData(source.id);
  source.name = data.name;
  source.imageFileHash = data.imageFileHash;
  source.goal = data.goal;
  source.role = data.role;
  source.createdAt = data.createdAt;
  if (source.team === undefined) {
    source.team = data.team;
  }
  if (source.cycleList === undefined) {
    source.cycleList = data.cycleList;
  }
  return data;
};

const userDataGraphQLType: g.GraphQLObjectType<
  database.GraphQLUserData,
  void,
  {}
> = new g.GraphQLObjectType({
  name: "UserData",
  fields: (): g.GraphQLFieldConfigMap<
    database.GraphQLUserData,
    void,
    unknown
  > =>
    makeObjectFieldMap<database.GraphQLUserData>({
      id: {
        description: "ユーザー識別するためのID",
        type: g.GraphQLNonNull(g.GraphQLString)
      },
      name: makeObjectField({
        args: {},
        description: "ユーザー名",
        resolve: async source => {
          if (source.name === undefined) {
            return (await setUserData(source)).name;
          }
          return source.name;
        },
        type: g.GraphQLNonNull(g.GraphQLString)
      }),
      imageFileHash: makeObjectField({
        args: {},
        description: "ユーザーのプロフィール画像のファイルハッシュ",
        resolve: async source => {
          if (source.imageFileHash === undefined) {
            return (await setUserData(source)).imageFileHash;
          }
          return source.imageFileHash;
        },
        type: g.GraphQLNonNull(hashGraphQLType)
      }),
      role: makeObjectField({
        args: {},
        description: "ユーザーの役割",
        resolve: async source => {
          if (source.role === undefined) {
            return (await setUserData(source)).role;
          }
          return source.role;
        },
        type: roleGraphQLType
      }),
      goal: makeObjectField({
        args: {},
        description: "個人目標/指導目標",
        resolve: async source => {
          if (source.goal === undefined) {
            return (await setUserData(source)).goal;
          }
          return source.goal;
        },
        type: g.GraphQLNonNull(g.GraphQLString)
      }),
      createdAt: makeObjectField({
        args: {},
        description: "ユーザーが作られた日時",
        resolve: async source => {
          if (source.createdAt === undefined) {
            return (await setUserData(source)).createdAt;
          }
          return source.createdAt;
        },
        type: g.GraphQLNonNull(dateTimeGraphQLType)
      }),
      team: makeObjectField({
        args: {},
        description: "所属しているチーム",
        type: teamGraphQLType,
        resolve: async source => {
          if (source.team === undefined) {
            return (await setUserData(source)).team;
          }
          return source.team;
        }
      }),
      cycleList: makeObjectField({
        args: {},
        description: "作ったサイクル",
        type: g.GraphQLNonNull(
          g.GraphQLList(g.GraphQLNonNull(cycleGraphQLType))
        ),
        resolve: async source => {
          if (source.cycleList === undefined) {
            return (await setUserData(source)).cycleList;
          }
          return source.cycleList;
        }
      })
    })
});

const setTeam = async (
  source: database.Return<database.GraphQLTeamData>
): Promise<database.GraphQLTeamDataLowCost> => {
  const data = await database.getTeamData(source.id);
  source.name = data.name;
  source.goal = data.goal;
  source.information = data.information;
  source.createdAt = data.createdAt;
  if (source.manager === undefined) {
    source.manager = data.manager;
  }
  if (source.playerList === undefined) {
    source.playerList = data.playerList;
  }
  return data;
};

const teamGraphQLType = new g.GraphQLObjectType<
  database.GraphQLTeamData,
  void,
  {}
>({
  name: "Team",
  fields: makeObjectFieldMap<database.GraphQLTeamData>({
    id: {
      type: g.GraphQLNonNull(g.GraphQLString),
      description: "チームを識別するためのID"
    },
    name: makeObjectField({
      args: {},
      description: "チーム名",
      type: g.GraphQLNonNull(g.GraphQLString),
      resolve: async source => {
        if (source.name === undefined) {
          return (await setTeam(source)).name;
        }
        return source.name;
      }
    }),
    goal: makeObjectField({
      args: {},
      description: "チーム目標",
      type: g.GraphQLNonNull(g.GraphQLString),
      resolve: async source => {
        if (source.goal === undefined) {
          return (await setTeam(source)).goal;
        }
        return source.goal;
      }
    }),
    information: makeObjectField({
      args: {},
      description: "チームの共有事項",
      type: g.GraphQLNonNull(g.GraphQLString),
      resolve: async source => {
        if (source.information === undefined) {
          return (await setTeam(source)).information;
        }
        return source.information;
      }
    }),
    createdAt: makeObjectField({
      args: {},
      description: "チームの作成日時",
      type: g.GraphQLNonNull(dateTimeGraphQLType),
      resolve: async source => {
        if (source.createdAt === undefined) {
          return (await setTeam(source)).createdAt;
        }
        return source.createdAt;
      }
    }),
    manager: makeObjectField({
      args: {},
      description: "監督",
      type: g.GraphQLNonNull(userDataGraphQLType),
      resolve: async source => {
        if (source.manager === undefined) {
          return (await setTeam(source)).manager;
        }
        return source.manager;
      }
    }),
    playerList: makeObjectField({
      args: {},
      description: "選手",
      type: g.GraphQLNonNull(
        g.GraphQLList(g.GraphQLNonNull(userDataGraphQLType))
      ),
      resolve: async source => {
        if (source.playerList === undefined) {
          return (await setTeam(source)).playerList;
        }
        return source.playerList;
      }
    })
  })
});

/**
 * 新規登録かログインするためのURLを得る。
 */
const getLineLogInUrl = (
  origin: data.Origin
): g.GraphQLFieldConfig<void, void, unknown> =>
  makeQueryOrMutationField<
    {
      path: string;
    },
    URL
  >({
    type: g.GraphQLNonNull(urlGraphQLType),
    args: {
      path: {
        type: g.GraphQLNonNull(g.GraphQLString),
        description: "ログインして返ってくるURLのパス"
      }
    },
    resolve: async args => {
      return data.urlWithQuery(
        "access.line.me",
        ["oauth2", "v2.1", "authorize"],
        new Map([
          ["response_type", "code"],
          ["client_id", data.lineLogInClientId],
          ["redirect_uri", data.lineLogInRedirectUri],
          ["scope", "profile openid"],
          [
            "state",
            await database.generateAndWriteLogInState(args.path, origin)
          ]
        ])
      );
    },
    description:
      "新規登録かログインするためのURLを得る。受け取ったURLをlocation.hrefに代入するとかして、各サービスの認証画面へ"
  });

const createTeamAndSetManagerRole = makeQueryOrMutationField<
  {
    accessToken: database.AccessToken;
    teamName: string;
  },
  database.GraphQLUserData
>({
  type: g.GraphQLNonNull(userDataGraphQLType),
  args: {
    accessToken: {
      type: g.GraphQLNonNull(g.GraphQLString),
      description: "アクセストークン"
    },
    teamName: {
      type: g.GraphQLNonNull(g.GraphQLString),
      description: "チーム名"
    }
  },
  description: "監督としてチームを登録する",
  resolve: async args => {
    return await database.createTeamAndSetManagerRole(
      args.accessToken,
      args.teamName
    );
  }
});

const joinTeamAndSetPlayerRole = makeQueryOrMutationField<
  {
    accessToken: database.AccessToken;
    teamId: database.TeamId;
  },
  database.GraphQLUserData
>({
  type: g.GraphQLNonNull(userDataGraphQLType),
  args: {
    accessToken: {
      type: g.GraphQLNonNull(g.GraphQLString),
      description: "アクセストークン"
    },
    teamId: {
      type: g.GraphQLNonNull(g.GraphQLString),
      description: "チームID"
    }
  },
  description: "選手としてチームに参加する",
  resolve: async args => {
    return await database.joinTeamAndSetPlayerRole(
      args.accessToken,
      args.teamId
    );
  }
});

const updatePersonalGoal = makeQueryOrMutationField<
  {
    accessToken: database.AccessToken;
    goal: string;
  },
  database.GraphQLUserData
>({
  type: g.GraphQLNonNull(userDataGraphQLType),
  args: {
    accessToken: {
      description: "アクセストークン",
      type: g.GraphQLNonNull(g.GraphQLString)
    },
    goal: {
      description: "目標",
      type: g.GraphQLNonNull(g.GraphQLString)
    }
  },
  description: "個人目標か指導目標を変更する",
  resolve: async args => {
    return await database.updatePersonalGoal(args.accessToken, args.goal);
  }
});

const updateTeamGoal = makeQueryOrMutationField<
  {
    accessToken: database.AccessToken;
    goal: string;
  },
  database.GraphQLTeamData
>({
  type: g.GraphQLNonNull(teamGraphQLType),
  args: {
    accessToken: {
      description: "アクセストークン",
      type: g.GraphQLNonNull(g.GraphQLString)
    },
    goal: {
      description: "目標",
      type: g.GraphQLNonNull(g.GraphQLString)
    }
  },
  description:
    "チーム目標を変更する。変更できるのはチームの指導者か、選手である必要がある",
  resolve: async args => {
    return await database.updateTeamGoal(args.accessToken, args.goal);
  }
});

const updateTeamInformation = makeQueryOrMutationField<
  {
    accessToken: database.AccessToken;
    information: string;
  },
  database.GraphQLTeamData
>({
  type: g.GraphQLNonNull(teamGraphQLType),
  args: {
    accessToken: {
      description: "アクセストークン",
      type: g.GraphQLNonNull(g.GraphQLString)
    },
    information: {
      description: "共有事項",
      type: g.GraphQLNonNull(g.GraphQLString)
    }
  },
  description:
    "チームの共有事項を変更する。変更できるのはチームの指導者か、選手である必要がある",
  resolve: async args => {
    return await database.updateTeamInformation(
      args.accessToken,
      args.information
    );
  }
});

const createCycle = makeQueryOrMutationField<
  {
    accessToken: database.AccessToken;
    plan: string;
    do: string;
    check: string;
    act: string;
  },
  database.GraphQLCycleData
>({
  type: g.GraphQLNonNull(cycleGraphQLType),
  args: {
    accessToken: {
      description: "アクセストークン",
      type: g.GraphQLNonNull(g.GraphQLString)
    },
    plan: {
      description: "Plan",
      type: g.GraphQLNonNull(g.GraphQLString)
    },
    do: {
      description: "Do",
      type: g.GraphQLNonNull(g.GraphQLString)
    },
    check: {
      description: "Check",
      type: g.GraphQLNonNull(g.GraphQLString)
    },
    act: {
      description: "Act",
      type: g.GraphQLNonNull(g.GraphQLString)
    }
  },
  description: "新しいCycleを作成する",
  resolve: async args => {
    return await database.createCycle(args);
  }
});

const updateCycle = makeQueryOrMutationField<
  {
    accessToken: database.AccessToken;
    cycleId: database.CycleId;
    plan: string;
    do: string;
    check: string;
    act: string;
  },
  database.GraphQLCycleData
>({
  type: g.GraphQLNonNull(cycleGraphQLType),
  args: {
    accessToken: {
      description: "アクセストークン",
      type: g.GraphQLNonNull(g.GraphQLString)
    },
    cycleId: {
      description: "更新するCycleのID",
      type: g.GraphQLNonNull(g.GraphQLString)
    },
    plan: {
      description: "Plan",
      type: g.GraphQLNonNull(g.GraphQLString)
    },
    do: {
      description: "Do",
      type: g.GraphQLNonNull(g.GraphQLString)
    },
    check: {
      description: "Check",
      type: g.GraphQLNonNull(g.GraphQLString)
    },
    act: {
      description: "Act",
      type: g.GraphQLNonNull(g.GraphQLString)
    }
  },
  description: "Cycleを更新する",
  resolve: async args => {
    return await database.updateCycle(args);
  }
});

export const schema = (origin: data.Origin): g.GraphQLSchema =>
  new g.GraphQLSchema({
    query: new g.GraphQLObjectType({
      name: "Query",
      description:
        "データを取得できる。データを取得したときに影響は他に及ばさない",
      fields: {
        hello: makeQueryOrMutationField<{}, string>({
          type: g.GraphQLNonNull(g.GraphQLString),
          args: {},
          description: "TEAMeにあいさつをする",
          resolve: async () => {
            return "やあ、TEAMeのAPIサーバーだよ";
          }
        }),
        userPrivate: makeQueryOrMutationField<
          { accessToken: database.AccessToken },
          database.GraphQLUserData
        >({
          type: g.GraphQLNonNull(userDataGraphQLType),
          args: {
            accessToken: {
              description: "アクセストークン",
              type: g.GraphQLNonNull(g.GraphQLString)
            }
          },
          description: "ユーザーのデータ",
          resolve: async args => {
            return await database.getUserByAccessToken(args.accessToken);
          }
        }),
        user: makeQueryOrMutationField<
          { userId: database.UserId },
          database.GraphQLUserData
        >({
          type: g.GraphQLNonNull(userDataGraphQLType),
          args: {
            userId: {
              description: "取得したいユーザーID",
              type: g.GraphQLNonNull(g.GraphQLString)
            }
          },
          description: "説明文",
          resolve: async args => {
            return await database.getUserData(args.userId);
          }
        }),
        allTeam: makeQueryOrMutationField<{}, Array<database.GraphQLTeamData>>({
          type: g.GraphQLNonNull(
            g.GraphQLList(g.GraphQLNonNull(teamGraphQLType))
          ),
          args: {},
          description: "すべてのチームを取得する",
          resolve: async () => {
            return await database.getAllTeam();
          }
        }),
        team: makeQueryOrMutationField<
          { id: database.TeamId },
          database.GraphQLTeamData
        >({
          type: g.GraphQLNonNull(teamGraphQLType),
          args: {
            id: {
              description: "チームのID",
              type: g.GraphQLNonNull(g.GraphQLString)
            }
          },
          description: "チームのデータ",
          resolve: async args => {
            return await database.getTeamData(args.id);
          }
        }),
        cycle: makeQueryOrMutationField<
          { id: database.CycleId },
          database.GraphQLCycleData
        >({
          type: g.GraphQLNonNull(cycleGraphQLType),
          args: {
            id: {
              description: "CycleのId",
              type: g.GraphQLNonNull(g.GraphQLString)
            }
          },
          description: "Cycleのデータ",
          resolve: args => database.getCycleData(args.id)
        })
      }
    }),
    mutation: new g.GraphQLObjectType({
      name: "Mutation",
      description: "データを作成、更新ができる",
      fields: {
        getLineLogInUrl: getLineLogInUrl(origin),
        createTeamAndSetManagerRole,
        joinTeamAndSetPlayerRole,
        updatePersonalGoal,
        updateTeamGoal,
        updateTeamInformation,
        createCycle,
        updateCycle
      }
    })
  });
