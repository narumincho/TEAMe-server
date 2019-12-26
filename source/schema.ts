import * as g from "graphql";
import Maybe from "graphql/tsutils/Maybe";
import { URL } from "url";
import * as tool from "./tool";
import * as key from "./key";
import * as database from "./database";

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
  resolve: (source: Return<Type>, args: T) => Promise<Return<Type[Key]>>;
  description: string;
}): GraphQLFieldConfigWithArgs<Type, Key> =>
  ({
    type: data.type,
    args: data.args,
    resolve: (source, args, context, info) => data.resolve(source as any, args),
    description: data.description
  } as GraphQLFieldConfigWithArgs<Type, Key>);

/** resolveで返すべき部分型を生成する */
type Return<Type> = Type extends Array<infer E>
  ? Array<ReturnLoop<E>>
  : ReturnLoop<Type>;

/** resolveで返すべき部分型を生成する型関数のループ */
type ReturnLoop<Type> = Type extends { id: infer idType }
  ? { id: idType } & { [k in keyof Type]?: Return<Type[k]> }
  : Type extends { hash: infer hashType }
  ? { hash: hashType } & { [k in keyof Type]?: Return<Type[k]> }
  : { [k in keyof Type]?: Return<Type[k]> };

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
  resolve: (args: Args) => Promise<Return<Type>>;
  description: string;
}): g.GraphQLFieldConfig<void, void, any> => {
  return {
    type: data.type,
    args: data.args,
    resolve: (source, args, context, info) => data.resolve(args),
    description: data.description
  };
};

const graphQLNonNullList = (
  type: g.GraphQLNullableType
): g.GraphQLNonNull<g.GraphQLNullableType> =>
  g.GraphQLNonNull(g.GraphQLList(g.GraphQLNonNull(type)));

const urlTypeScalarTypeConfig: g.GraphQLScalarTypeConfig<URL, string> = {
  name: "URL",
  description: `URL 文字列で指定する 例"https://narumincho.com/definy/spec.html"`,
  serialize: (url: URL): string => url.toString(),
  parseValue: (value: string): URL => new URL(value)
};

const urlGraphQLType = new g.GraphQLScalarType(urlTypeScalarTypeConfig);

/**
 * 新規登録かログインするためのURLを得る。
 */
const getLineLogInUrl = makeQueryOrMutationField<{}, URL>({
  type: g.GraphQLNonNull(urlGraphQLType),
  args: {},
  resolve: async args => {
    return tool.urlFromStringWithQuery(
      "access.line.me/oauth2/v2.1/authorize",
      new Map([
        ["response_type", "code"],
        ["client_id", key.lineLogInClientId],
        ["redirect_uri", key.lineLogInRedirectUri],
        ["scope", "profile openid"],
        ["state", await database.generateAndWriteLogInState()]
      ])
    );
  },
  description:
    "新規登録かログインするためのURLを得る。受け取ったURLをlocation.hrefに代入するとかして、各サービスの認証画面へ"
});

export const schema = new g.GraphQLSchema({
  query: new g.GraphQLObjectType({
    name: "Query",
    description:
      "データを取得できる。データを取得したときに影響は他に及ばさない",
    fields: {}
  }),
  mutation: new g.GraphQLObjectType({
    name: "Mutation",
    description: "データを作成、更新ができる",
    fields: {
      getLineLogInUrl
    }
  })
});
